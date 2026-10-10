"""Trip planning use case: routes -> checkpoints & ETAs -> forecast at ETA -> risk -> recommendation."""

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.core.cache import cache

from providers import here, openmeteo
from risk.aggregate import RouteRiskSummary, summarize
from risk.levels import RiskLevel
from risk.recommend import RouteCandidate, recommend
from risk.rules import Assessment, Conditions, assess
from routing.checkpoints import Checkpoint, build_checkpoints
from routing.dedupe import distinct_indices
from routing.eta import vertex_times
from routing.geometry import LatLon, cumulative_miles
from routing.simplify import simplify
from weather.matching import HOUR, WeatherSample, ceil_hour, floor_hour, sample_at
from weather.units import lb_to_kg

MAX_ROUTES = 3
HEATMAP_HOURS = 48
PLAN_CACHE_TTL_S = 10 * 60


@dataclass(frozen=True)
class Location:
    lat: float
    lon: float
    label: str = ""

    @property
    def point(self) -> LatLon:
        return self.lat, self.lon


@dataclass(frozen=True)
class TripRequest:
    origin: Location
    destination: Location
    departure: datetime
    load_weight_lb: int
    sample_interval_mi: int

    def fingerprint(self) -> str:
        payload = {
            "o": [round(self.origin.lat, 5), round(self.origin.lon, 5)],
            "d": [round(self.destination.lat, 5), round(self.destination.lon, 5)],
            "t": self.departure.astimezone(UTC).isoformat(),
            "w": self.load_weight_lb,
            "i": self.sample_interval_mi,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]


def forecast_window(departure: datetime, last_eta: datetime) -> tuple[datetime, datetime]:
    """Shared by the plan and the heatmap so both hit the same cached forecasts.

    Covers the whole trip and at least 48 h after departure (the heatmap slider range).
    """
    start = floor_hour(departure)
    end = max(start + timedelta(hours=HEATMAP_HOURS), ceil_hour(last_eta))
    return start, end


@dataclass
class _RouteAnalysis:
    id: str
    label: str
    coords: list[LatLon]
    duration_s: float
    distance_mi: float
    checkpoints: list[Checkpoint]
    notices: list[str]


def _analyze_geometry(idx: int, route: here.ProviderRoute, req: TripRequest) -> _RouteAnalysis:
    cum = cumulative_miles(route.coords)
    times = vertex_times(cum, route.spans, route.duration_s)
    return _RouteAnalysis(
        id=f"r{idx + 1}",
        label=f"Route {chr(ord('A') + idx)}",
        coords=route.coords,
        duration_s=route.duration_s,
        distance_mi=cum[-1],
        checkpoints=build_checkpoints(route.coords, cum, times, req.departure, req.sample_interval_mi),
        notices=route.notices,
    )


def _iso(t: datetime) -> str:
    return t.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _level_name(level: RiskLevel | None) -> str:
    return level.name if level is not None else "UNKNOWN"


def _checkpoint_json(cp: Checkpoint, sample: WeatherSample | None, assessment: Assessment | None) -> dict:
    return {
        "seq": cp.seq,
        "lat": round(cp.lat, 5),
        "lon": round(cp.lon, 5),
        "mile": round(cp.mile, 2),
        "eta": _iso(cp.eta),
        "weather": (
            {
                "status": "ok",
                "time": _iso(sample.time),
                "wind_mph": round(sample.wind_mph, 1),
                "gust_mph": None if sample.gust_mph is None else round(sample.gust_mph, 1),
                "rain_in_hr": round(sample.rain_in_hr, 3),
                "snow_in_hr": round(sample.snow_in_hr, 3),
            }
            if sample
            else {"status": "unavailable"}
        ),
        "risk": {
            "level": _level_name(assessment.level if assessment else None),
            "factors": {k: v.name for k, v in assessment.factors.items()} if assessment else {},
        },
    }


def _summary_json(s: RouteRiskSummary) -> dict:
    return {
        "severe_or_worse_miles": round(s.severe_or_worse_miles, 1),
        "no_travel_miles": round(s.no_travel_miles, 1),
        "severe_miles": round(s.severe_miles, 1),
        "high_miles": round(s.high_miles, 1),
        "moderate_miles": round(s.miles_by_level[RiskLevel.MODERATE], 1),
        "low_miles": round(s.miles_by_level[RiskLevel.LOW], 1),
        "unknown_miles": round(s.unknown_miles, 1),
        "avg_risk": None if s.avg_risk is None else round(s.avg_risk, 2),
        "max_level": _level_name(s.max_level),
        "unsafe": s.unsafe,
    }


def plan_trip(req: TripRequest, now: datetime | None = None) -> dict:
    gross_kg = round(lb_to_kg(settings.TRUCK_TARE_WEIGHT_LB + req.load_weight_lb))
    provider_routes = here.fetch_truck_routes(
        req.origin.point, req.destination.point, req.departure, gross_kg
    )
    keep = distinct_indices([r.coords for r in provider_routes], MAX_ROUTES)
    routes = [_analyze_geometry(i, provider_routes[k], req) for i, k in enumerate(keep)]

    notices: list[str] = []
    if len(routes) < MAX_ROUTES:
        notices.append(
            f"The routing provider returned {len(routes)} distinct truck "
            f"route{'s' if len(routes) != 1 else ''} for this trip."
        )

    all_checkpoints = [cp for r in routes for cp in r.checkpoints]
    start, end = forecast_window(req.departure, max(cp.eta for cp in all_checkpoints))
    forecast = openmeteo.fetch_forecasts([(cp.lat, cp.lon) for cp in all_checkpoints], start, end, now)
    if forecast.failed_cells:
        notices.append("Some forecast data could not be loaded; affected checkpoints are marked Unknown.")

    routes_json, candidates = [], []
    unknown_checkpoints = 0
    for route in routes:
        checkpoints_json, levels = [], []
        for cp in route.checkpoints:
            series = forecast.series.get(openmeteo.snap((cp.lat, cp.lon)))
            sample = sample_at(series, cp.eta) if series else None
            assessment = (
                assess(Conditions(sample.wind_mph, sample.rain_in_hr, sample.snow_in_hr), req.load_weight_lb)
                if sample
                else None
            )
            unknown_checkpoints += assessment is None
            levels.append(assessment.level if assessment else None)
            checkpoints_json.append(_checkpoint_json(cp, sample, assessment))

        summary = summarize([cp.mile for cp in route.checkpoints], levels)
        candidates.append(RouteCandidate(route.id, route.label, route.duration_s, summary))
        routes_json.append(
            {
                "id": route.id,
                "label": route.label,
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[round(lon, 5), round(lat, 5)] for lat, lon in simplify(route.coords)],
                },
                "distance_mi": round(route.distance_mi, 1),
                "duration_s": round(route.duration_s),
                "departure_time": _iso(req.departure),
                "arrival_time": _iso(req.departure + timedelta(seconds=route.duration_s)),
                "summary": _summary_json(summary),
                "checkpoints": checkpoints_json,
                "notices": route.notices,
            }
        )

    if unknown_checkpoints and not forecast.failed_cells:
        notices.append(
            f"{unknown_checkpoints} checkpoint(s) fall outside the available forecast and are marked Unknown."
        )

    rec = recommend(candidates)
    return {
        "trip_id": req.fingerprint(),
        "generated_at": _iso(now or datetime.now(UTC)),
        "request": {
            "origin": req.origin.__dict__,
            "destination": req.destination.__dict__,
            "departure_time": _iso(req.departure),
            "load_weight_lb": req.load_weight_lb,
            "sample_interval_mi": req.sample_interval_mi,
        },
        "forecast_window": {"start": _iso(start), "end": _iso(end), "hours": int((end - start) / HOUR)},
        "recommendation": {
            "route_id": rec.route_id,
            "ranking": rec.ranking,
            "all_routes_unsafe": rec.all_routes_unsafe,
            "rationale": rec.rationale,
        },
        "routes": routes_json,
        "notices": notices,
    }


def plan_trip_cached(req: TripRequest) -> dict:
    """Identical requests within the same hour reuse the plan (also protects provider quotas)."""
    now = datetime.now(UTC)
    key = f"plan:{req.fingerprint()}:{now:%Y%m%d%H}"
    result = cache.get(key)
    if result is None:
        result = plan_trip(req, now)
        cache.set(key, result, timeout=PLAN_CACHE_TTL_S)
    return result

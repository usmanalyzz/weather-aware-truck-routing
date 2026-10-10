"""Corridor weather heatmap: hourly forecasts on a grid around all routes, 0-48 h after departure.

Values are what the forecast model gives at each grid point; the map blends between points visually.
Risk per point/hour uses the same rules and load as the checkpoints, so the heatmap and route risk agree.
"""

from datetime import datetime, timedelta

from django.conf import settings
from django.core.cache import cache

from providers import openmeteo
from risk.rules import THRESHOLDS, Conditions, assess
from routing.corridor import corridor_grid
from weather.matching import HourlySeries

from .plan_trip import HEATMAP_HOURS, TripRequest, plan_trip_cached

HOURS = HEATMAP_HOURS + 1  # 0..48 inclusive
HEATMAP_CACHE_TTL_S = 10 * 60


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _round(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def _hourly_values(series: HourlySeries | None, start: datetime, load_lb: int) -> dict[str, list]:
    risk, wind, rain, snow = [], [], [], []
    for h in range(HOURS):
        idx = series.index_of(start + timedelta(hours=h)) if series else None
        w = series.wind_mph[idx] if idx is not None else None
        r = series.rain_in[idx] if idx is not None else None
        s = series.snow_in[idx] if idx is not None else None
        level = None
        if w is not None and r is not None and s is not None:
            level = int(assess(Conditions(max(w, 0.0), max(r, 0.0), max(s, 0.0)), load_lb).level)
        risk.append(level)
        wind.append(_round(w, 1))
        rain.append(_round(r, 3))
        snow.append(_round(s, 2))
    return {"risk": risk, "wind_mph": wind, "rain_in_hr": rain, "snow_in_hr": snow}


def build_heatmap(req: TripRequest, plan: dict, now: datetime | None = None) -> dict:
    routes = [[(lat, lon) for lon, lat in r["geometry"]["coordinates"]] for r in plan["routes"]]
    grid = corridor_grid(routes, max_points=settings.HEATMAP_MAX_POINTS)
    cells = [openmeteo.snap(p) for p in grid.points]
    start = _parse(plan["forecast_window"]["start"])
    end = _parse(plan["forecast_window"]["end"])

    forecast = openmeteo.fetch_forecasts(cells, start, end, now)

    values: dict[str, list[list]] = {"risk": [], "wind_mph": [], "rain_in_hr": [], "snow_in_hr": []}
    for cell in cells:
        for metric, hourly in _hourly_values(forecast.series.get(cell), start, req.load_weight_lb).items():
            values[metric].append(hourly)

    available = [any(row[h] is not None for row in values["risk"]) for h in range(HOURS)]
    notices = []
    if forecast.failed_cells:
        notices.append("Part of the corridor forecast could not be loaded; those areas are left blank.")
    if not all(available):
        first_missing = available.index(False)
        notices.append(f"Forecast data ends {first_missing} h after departure (provider horizon).")

    return {
        "trip_id": plan["trip_id"],
        "start": plan["forecast_window"]["start"],
        "hours": HOURS,
        "load_weight_lb": req.load_weight_lb,
        "grid": {"spacing_mi": round(grid.spacing_mi, 1), "radius_mi": grid.radius_mi, "count": len(cells)},
        "points": [[lon, lat] for lat, lon in cells],
        "values": values,
        "available_hours": available,
        "scales": THRESHOLDS,
        "notices": notices,
    }


def heatmap_cached(req: TripRequest) -> dict:
    plan = plan_trip_cached(req)  # same request just planned -> cache hit, no extra routing call
    key = f"heatmap:{plan['trip_id']}:{plan['generated_at'][:13]}"
    result = cache.get(key)
    if result is None:
        result = build_heatmap(req, plan, now=_parse(plan["generated_at"]))
        cache.set(key, result, timeout=HEATMAP_CACHE_TTL_S)
    return result

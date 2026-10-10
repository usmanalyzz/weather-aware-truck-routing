"""HERE Routing API v8 (truck routes) and Autosuggest v1 (address search).

Docs: https://docs.here.com/routing/reference/routing-api-v8-calculateroutes
The API key is only ever sent from the server.
"""

from dataclasses import dataclass, field
from datetime import datetime

import flexpolyline
from django.conf import settings

from routing.eta import Span
from routing.geometry import LatLon

from .errors import GeocodingUnavailable, NoRouteFound, RoutingUnavailable
from .http import get_json

ROUTES_URL = "https://router.hereapi.com/v8/routes"
AUTOSUGGEST_URL = "https://autosuggest.search.hereapi.com/v1/autosuggest"
# Autosuggest requires a search position; bias to the centre of the contiguous US (results stay US/Canada).
US_CENTER = "39.83,-98.58"


@dataclass(frozen=True)
class ProviderRoute:
    coords: list[LatLon]
    spans: list[Span]  # offsets index into `coords`
    duration_s: float
    length_m: float
    notices: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Place:
    label: str
    lat: float
    lon: float


def _api_key() -> str:
    key = settings.HERE_API_KEY
    if not key:
        raise RoutingUnavailable("HERE_API_KEY is not configured")
    return key


def fetch_truck_routes(
    origin: LatLon,
    destination: LatLon,
    departure: datetime,
    gross_weight_kg: int,
    alternatives: int = 5,
) -> list[ProviderRoute]:
    params = {
        "transportMode": "truck",
        "origin": f"{origin[0]},{origin[1]}",
        "destination": f"{destination[0]},{destination[1]}",
        "departureTime": departure.isoformat(timespec="seconds"),
        "alternatives": alternatives,
        "return": "polyline,summary",
        # Spans only split where a requested attribute changes; dynamicSpeedInfo splits wherever the
        # expected speed changes (~600 spans on a 1,000 mi trip), giving per-stretch durations for ETAs.
        # With only duration/length HERE returns a single span, i.e. one average speed for the whole trip.
        "spans": "duration,length,dynamicSpeedInfo",
        "vehicle[grossWeight]": gross_weight_kg,
        "units": "metric",
        "apiKey": _api_key(),
    }
    data = get_json(ROUTES_URL, params, error_cls=RoutingUnavailable)
    routes = [parse_route(raw) for raw in data.get("routes", [])]
    if not routes:
        titles = "; ".join(n.get("title", "") for n in data.get("notices", []))
        raise NoRouteFound(titles or "HERE returned no routes")
    return routes


def parse_route(raw: dict) -> ProviderRoute:
    """Concatenate a route's sections into one polyline with span offsets re-based onto it."""
    coords: list[LatLon] = []
    spans: list[Span] = []
    duration = length = 0.0
    notices: list[str] = []

    for section in raw.get("sections", []):
        points = [(p[0], p[1]) for p in flexpolyline.decode(section["polyline"])]
        # Consecutive sections usually share their junction vertex; keep it once.
        if coords and points and points[0] == coords[-1]:
            base = len(coords) - 1
            points = points[1:]
        else:
            base = len(coords)
        coords.extend(points)

        summary = section.get("summary", {})
        section_duration = float(summary.get("duration", 0))
        section_spans = section.get("spans") or [{"offset": 0, "duration": section_duration}]
        if section_spans[0].get("offset", 0) != 0:  # make sure the section start is covered
            section_spans = [{"offset": 0, "duration": 0}, *section_spans]
        spans.extend(
            Span(offset=base + int(s.get("offset", 0)), duration_s=float(s.get("duration", 0)))
            for s in section_spans
        )

        duration += section_duration
        length += float(summary.get("length", 0))
        notices.extend(n.get("title") or n.get("code", "") for n in section.get("notices", []))

    if len(coords) < 2:
        raise RoutingUnavailable("HERE route without geometry")
    return ProviderRoute(coords=coords, spans=spans, duration_s=duration, length_m=length, notices=notices)


def autosuggest(query: str, limit: int = 6) -> list[Place]:
    if not settings.HERE_API_KEY:
        raise GeocodingUnavailable("HERE_API_KEY is not configured")
    params = {
        "q": query,
        "at": US_CENTER,
        "in": "countryCode:USA,CAN",
        "limit": limit,
        "lang": "en-US",
        "apiKey": settings.HERE_API_KEY,
    }
    data = get_json(AUTOSUGGEST_URL, params, error_cls=GeocodingUnavailable)
    places = []
    for item in data.get("items", []):
        position = item.get("position")
        if not position:  # category/chain query suggestions have no coordinates
            continue
        label = item.get("address", {}).get("label") or item.get("title", "")
        places.append(Place(label=label, lat=position["lat"], lon=position["lng"]))
    return places

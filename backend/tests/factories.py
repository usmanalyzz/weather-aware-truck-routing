"""Synthetic provider payloads shaped like real HERE / Open-Meteo responses (verified against live APIs)."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import flexpolyline
import httpx

from routing.geometry import cumulative_miles


def line(start: tuple[float, float], end: tuple[float, float], steps: int = 60) -> list[tuple[float, float]]:
    return [
        (
            round(start[0] + (end[0] - start[0]) * i / steps, 5),
            round(start[1] + (end[1] - start[1]) * i / steps, 5),
        )
        for i in range(steps + 1)
    ]


def dogleg(origin, destination, via, steps=30) -> list[tuple[float, float]]:
    return line(origin, via, steps) + line(via, destination, steps)[1:]


def here_section(coords, duration_s: float, n_spans: int = 2, notices=None) -> dict:
    """One HERE section with equal-duration spans."""
    offsets = [round(i * (len(coords) - 1) / n_spans) for i in range(n_spans)]
    spans = [{"offset": o, "duration": round(duration_s / n_spans), "length": 0} for o in offsets]
    return {
        "id": "s",
        "type": "vehicle",
        "polyline": flexpolyline.encode(coords),
        "summary": {"duration": duration_s, "length": cumulative_miles(coords)[-1] * 1609.344},
        "spans": spans,
        "notices": notices or [],
        "transport": {"mode": "truck"},
    }


def here_routes(*routes: tuple[list[tuple[float, float]], float]) -> dict:
    return {
        "routes": [{"id": f"route-{i}", "sections": [here_section(c, d)]} for i, (c, d) in enumerate(routes)]
    }


Weather = Callable[[float, float, datetime], dict]


def calm(_lat, _lon, _t) -> dict:
    return {"wind": 8.0, "gust": 15.0, "rain": 0.0, "showers": 0.0, "snow": 0.0}


def openmeteo_handler(weather: Weather = calm, calls: list | None = None):
    """respx side effect that answers multi-location requests for the requested hour window."""

    def handler(request: httpx.Request) -> httpx.Response:
        q = {k: v[0] for k, v in parse_qs(urlparse(str(request.url)).query).items()}
        if calls is not None:
            calls.append(q)
        lats = [float(x) for x in q["latitude"].split(",")]
        lons = [float(x) for x in q["longitude"].split(",")]
        start = datetime.fromisoformat(q["start_hour"]).replace(tzinfo=UTC)
        end = datetime.fromisoformat(q["end_hour"]).replace(tzinfo=UTC)
        hours = [start + timedelta(hours=h) for h in range(int((end - start).total_seconds() // 3600) + 1)]
        payloads = []
        for lat, lon in zip(lats, lons, strict=True):
            values = [weather(lat, lon, t) for t in hours]
            payloads.append(
                {
                    "latitude": lat,
                    "longitude": lon,
                    "timezone": "GMT",
                    "hourly": {
                        "time": [t.strftime("%Y-%m-%dT%H:%M") for t in hours],
                        "wind_speed_10m": [v["wind"] for v in values],
                        "wind_gusts_10m": [v["gust"] for v in values],
                        "rain": [v["rain"] for v in values],
                        "showers": [v["showers"] for v in values],
                        "snowfall": [v["snow"] for v in values],
                    },
                }
            )
        return httpx.Response(200, json=payloads if len(payloads) > 1 else payloads[0])

    return handler

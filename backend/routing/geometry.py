"""Small, dependency-free geodesic helpers. Coordinates are (lat, lon) in degrees."""

import math
from bisect import bisect_right
from collections.abc import Sequence

LatLon = tuple[float, float]

EARTH_RADIUS_MI = 3958.7613


def haversine_miles(a: LatLon, b: LatLon) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(min(1.0, math.sqrt(h)))


def cumulative_miles(coords: Sequence[LatLon]) -> list[float]:
    """Road distance from the first vertex to every vertex along the polyline."""
    if not coords:
        return []
    cum = [0.0]
    for prev, cur in zip(coords, coords[1:], strict=False):
        cum.append(cum[-1] + haversine_miles(prev, cur))
    return cum


def locate(cum: Sequence[float], mile: float) -> tuple[int, float]:
    """Find the segment containing `mile`.

    Returns (i, fraction) such that the point lies between vertex i and i + 1 at `fraction` of the way.
    `mile` is clamped to the polyline's length.
    """
    if len(cum) < 2:
        return 0, 0.0
    mile = min(max(mile, 0.0), cum[-1])
    i = min(bisect_right(cum, mile) - 1, len(cum) - 2)
    seg = cum[i + 1] - cum[i]
    return i, (mile - cum[i]) / seg if seg > 0 else 0.0


def interpolate(a: float, b: float, fraction: float) -> float:
    return a + (b - a) * fraction


def point_at_mile(coords: Sequence[LatLon], cum: Sequence[float], mile: float) -> LatLon:
    if len(coords) == 1:
        return coords[0]
    i, f = locate(cum, mile)
    (lat1, lon1), (lat2, lon2) = coords[i], coords[i + 1]
    return interpolate(lat1, lat2, f), interpolate(lon1, lon2, f)

"""Regular grid of forecast sample points covering the corridor around a set of routes.

The grid is regular in miles (not degrees), so on the map every point represents roughly the same area and a
heatmap's colour is driven by the forecast value, not by how densely points happen to be packed.
"""

import math
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

from .checkpoints import checkpoint_miles
from .geometry import EARTH_RADIUS_MI, LatLon, cumulative_miles, haversine_miles, point_at_mile

MILES_PER_DEG_LAT = 2 * math.pi * EARTH_RADIUS_MI / 360
ROUTE_SAMPLE_MI = 5.0


@dataclass(frozen=True)
class CorridorGrid:
    points: list[LatLon]
    spacing_mi: float
    radius_mi: float


def _route_samples(routes: Sequence[Sequence[LatLon]]) -> list[LatLon]:
    samples = []
    for coords in routes:
        cum = cumulative_miles(coords)
        samples.extend(point_at_mile(coords, cum, m) for m in checkpoint_miles(cum[-1], ROUTE_SAMPLE_MI))
    return samples


def _grid_points(routes: Sequence[Sequence[LatLon]], spacing_mi: float, radius_mi: float) -> list[LatLon]:
    samples = _route_samples(routes)
    lats = [p[0] for p in samples]
    lons = [p[1] for p in samples]
    mid_lat = (min(lats) + max(lats)) / 2
    mi_per_deg_lon = MILES_PER_DEG_LAT * max(math.cos(math.radians(mid_lat)), 0.1)

    dlat = spacing_mi / MILES_PER_DEG_LAT
    dlon = spacing_mi / mi_per_deg_lon
    pad_lat = radius_mi / MILES_PER_DEG_LAT
    pad_lon = radius_mi / mi_per_deg_lon

    # Spatial hash of route samples with cells as large as the radius: only 3x3 neighbours need checking.
    cell_lat, cell_lon = pad_lat, pad_lon
    buckets: dict[tuple[int, int], list[LatLon]] = defaultdict(list)
    for p in samples:
        buckets[(math.floor(p[0] / cell_lat), math.floor(p[1] / cell_lon))].append(p)

    # Reach = radius plus half the route sample spacing, so points between samples are not dropped.
    reach = radius_mi + ROUTE_SAMPLE_MI / 2
    points = []
    lat0, lat1 = min(lats) - pad_lat, max(lats) + pad_lat
    lon0, lon1 = min(lons) - pad_lon, max(lons) + pad_lon
    rows = int((lat1 - lat0) / dlat) + 1
    cols = int((lon1 - lon0) / dlon) + 1
    for r in range(rows):
        lat = lat0 + r * dlat
        for c in range(cols):
            lon = lon0 + c * dlon
            ci, cj = math.floor(lat / cell_lat), math.floor(lon / cell_lon)
            near = any(
                haversine_miles((lat, lon), q) <= reach
                for di in (-1, 0, 1)
                for dj in (-1, 0, 1)
                for q in buckets.get((ci + di, cj + dj), ())
            )
            if near:
                points.append((lat, lon))
    return points


def corridor_grid(
    routes: Sequence[Sequence[LatLon]],
    spacing_mi: float = 15.0,
    radius_mi: float = 40.0,
    max_points: int = 600,
) -> CorridorGrid:
    """Grid points within `radius_mi` of any route. Spacing grows until the grid fits `max_points`."""
    if not routes or any(len(r) < 2 for r in routes):
        raise ValueError("corridor_grid needs routes with at least two points")
    while True:
        points = _grid_points(routes, spacing_mi, radius_mi)
        if len(points) <= max_points:
            return CorridorGrid(points=points, spacing_mi=spacing_mi, radius_mi=radius_mi)
        spacing_mi *= math.sqrt(len(points) / max_points) * 1.05

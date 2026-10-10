"""Drop alternative routes that are effectively the same road.

Two routes are duplicates when at least `threshold` of points sampled along *each* lies within
`tolerance_mi` of the other. Points are hashed into a coarse grid so the check stays linear in size.
"""

import math
from collections import defaultdict
from collections.abc import Sequence

from .checkpoints import checkpoint_miles
from .geometry import LatLon, cumulative_miles, haversine_miles, point_at_mile

SAMPLE_MI = 1.0
DENSE_MI = 0.25
TOLERANCE_MI = 0.5
THRESHOLD = 0.9
_CELL_DEG = 0.02  # ~1.4 mi of latitude, comfortably larger than the tolerance


def _resample(coords: Sequence[LatLon], step_mi: float) -> list[LatLon]:
    cum = cumulative_miles(coords)
    return [point_at_mile(coords, cum, m) for m in checkpoint_miles(cum[-1], step_mi)]


def _grid(points: Sequence[LatLon]) -> dict[tuple[int, int], list[LatLon]]:
    grid: dict[tuple[int, int], list[LatLon]] = defaultdict(list)
    for p in points:
        grid[(math.floor(p[0] / _CELL_DEG), math.floor(p[1] / _CELL_DEG))].append(p)
    return grid


def _near(point: LatLon, grid, tolerance_mi: float) -> bool:
    ci, cj = math.floor(point[0] / _CELL_DEG), math.floor(point[1] / _CELL_DEG)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            for q in grid.get((ci + di, cj + dj), ()):
                if haversine_miles(point, q) <= tolerance_mi:
                    return True
    return False


def overlap(a: Sequence[LatLon], b: Sequence[LatLon], tolerance_mi: float = TOLERANCE_MI) -> float:
    """Share of `a`'s sample points that lie within `tolerance_mi` of route `b`."""
    samples = _resample(a, SAMPLE_MI)
    grid = _grid(_resample(b, DENSE_MI))
    return sum(_near(p, grid, tolerance_mi) for p in samples) / len(samples)


def is_duplicate(a: Sequence[LatLon], b: Sequence[LatLon], threshold: float = THRESHOLD) -> bool:
    return overlap(a, b) >= threshold and overlap(b, a) >= threshold


def distinct_indices(routes: Sequence[Sequence[LatLon]], limit: int) -> list[int]:
    """Indices of up to `limit` mutually distinct routes, preserving provider order."""
    kept: list[int] = []
    for i, coords in enumerate(routes):
        if all(not is_duplicate(coords, routes[j]) for j in kept):
            kept.append(i)
        if len(kept) == limit:
            break
    return kept

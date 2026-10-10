"""Ramer-Douglas-Peucker line simplification for display geometry only.

Risk, distance and ETA calculations always use the full-resolution polyline; this only shrinks the
GeoJSON sent to the browser (typically 80-90% fewer vertices on interstate routes).
"""

import math
from collections.abc import Sequence

from .geometry import LatLon


def _perpendicular_deg(p: LatLon, a: LatLon, b: LatLon) -> float:
    # Local equirectangular projection; accurate enough at the ~50 m tolerances used here.
    k = math.cos(math.radians((a[0] + b[0]) / 2))
    px, py = (p[1] - a[1]) * k, p[0] - a[0]
    bx, by = (b[1] - a[1]) * k, b[0] - a[0]
    seg = bx * bx + by * by
    if seg == 0:
        return math.hypot(px, py)
    t = max(0.0, min(1.0, (px * bx + py * by) / seg))
    return math.hypot(px - t * bx, py - t * by)


def simplify(coords: Sequence[LatLon], tolerance_deg: float = 0.0004) -> list[LatLon]:
    n = len(coords)
    if n <= 2:
        return list(coords)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        first, last = stack.pop()
        max_dist, index = 0.0, -1
        for i in range(first + 1, last):
            d = _perpendicular_deg(coords[i], coords[first], coords[last])
            if d > max_dist:
                max_dist, index = d, i
        if index != -1 and max_dist > tolerance_deg:
            keep[index] = True
            stack.extend(((first, index), (index, last)))
    return [c for c, k in zip(coords, keep, strict=True) if k]

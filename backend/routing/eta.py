"""Elapsed travel time along a route geometry.

HERE returns `spans` that each start at a polyline vertex `offset` and carry the span's travel
`duration` in seconds (a span ends where the next one starts). Within a span we spread its duration
over the vertices in proportion to distance. That keeps slow urban stretches slow and fast interstate
stretches fast instead of assuming one average speed for the whole trip.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from .geometry import interpolate, locate


@dataclass(frozen=True)
class Span:
    offset: int  # index of the first polyline vertex covered by this span
    duration_s: float


def vertex_times(cum: Sequence[float], spans: Sequence[Span], total_duration_s: float) -> list[float]:
    """Elapsed seconds from departure at every polyline vertex.

    Without spans the route's total duration is spread uniformly by distance.
    """
    n = len(cum)
    if n == 0:
        return []
    if not spans:
        spans = [Span(offset=0, duration_s=total_duration_s)]

    ordered = sorted(spans, key=lambda s: s.offset)
    if ordered[0].offset != 0:
        raise ValueError("The first span must start at vertex 0")

    times = [0.0] * n
    elapsed = 0.0
    for idx, span in enumerate(ordered):
        start = span.offset
        end = ordered[idx + 1].offset if idx + 1 < len(ordered) else n - 1
        if not 0 <= start <= end < n:
            raise ValueError(f"Span offsets out of range: {start}..{end} for {n} vertices")
        length = cum[end] - cum[start]
        for v in range(start + 1, end + 1):
            share = (cum[v] - cum[start]) / length if length > 0 else 1.0
            times[v] = elapsed + span.duration_s * share
        elapsed += span.duration_s
    return times


def time_at_mile(cum: Sequence[float], times: Sequence[float], mile: float) -> float:
    if len(cum) < 2:
        return 0.0
    i, f = locate(cum, mile)
    return interpolate(times[i], times[i + 1], f)

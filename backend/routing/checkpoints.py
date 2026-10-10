"""Weather checkpoints placed every N road miles along a route, plus origin and destination."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from .eta import time_at_mile
from .geometry import LatLon, point_at_mile

ALLOWED_INTERVALS_MI = (10, 25, 50)
_EPSILON_MI = 1e-6


@dataclass(frozen=True)
class Checkpoint:
    seq: int
    lat: float
    lon: float
    mile: float
    eta: datetime


def checkpoint_miles(total_mi: float, interval_mi: float) -> list[float]:
    """[0, N, 2N, ..., total]. The final gap may be shorter than N; the destination is always included."""
    if interval_mi <= 0:
        raise ValueError("interval_mi must be positive")
    if total_mi <= _EPSILON_MI:
        return [0.0]
    miles = [0.0]
    k = 1
    while k * interval_mi < total_mi - _EPSILON_MI:
        miles.append(k * interval_mi)
        k += 1
    miles.append(total_mi)
    return miles


def build_checkpoints(
    coords: Sequence[LatLon],
    cum: Sequence[float],
    times: Sequence[float],
    departure: datetime,
    interval_mi: float,
) -> list[Checkpoint]:
    checkpoints = []
    for seq, mile in enumerate(checkpoint_miles(cum[-1], interval_mi)):
        lat, lon = point_at_mile(coords, cum, mile)
        eta = departure + timedelta(seconds=time_at_mile(cum, times, mile))
        checkpoints.append(Checkpoint(seq=seq, lat=lat, lon=lon, mile=mile, eta=eta))
    return checkpoints

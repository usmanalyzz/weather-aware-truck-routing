"""Turn per-checkpoint risk into route-level risk miles.

Each checkpoint "owns" the stretch of road nearest to it: from the midpoint with the previous checkpoint
to the midpoint with the next one (origin and destination own half a gap). The owned lengths add up
exactly to the route length, and no stretch is counted twice.

Checkpoints without a forecast (level None) contribute `unknown_miles` and are excluded from the
distance-weighted average risk, rather than being treated as Low.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from .levels import RiskLevel


@dataclass(frozen=True)
class RouteRiskSummary:
    miles_by_level: dict[RiskLevel, float]
    unknown_miles: float
    avg_risk: float | None  # None when no checkpoint has a forecast
    max_level: RiskLevel | None

    @property
    def severe_miles(self) -> float:
        return self.miles_by_level[RiskLevel.SEVERE]

    @property
    def no_travel_miles(self) -> float:
        return self.miles_by_level[RiskLevel.NO_TRAVEL]

    @property
    def severe_or_worse_miles(self) -> float:
        return self.severe_miles + self.no_travel_miles

    @property
    def high_miles(self) -> float:
        return self.miles_by_level[RiskLevel.HIGH]

    @property
    def unsafe(self) -> bool:
        return self.no_travel_miles > 0


def owned_miles(miles: Sequence[float]) -> list[float]:
    """Length of road owned by each checkpoint, given checkpoint positions in road miles (ascending)."""
    n = len(miles)
    if n < 2:
        return [0.0] * n
    owned = []
    for i in range(n):
        left = miles[i] - miles[i - 1] if i > 0 else 0.0
        right = miles[i + 1] - miles[i] if i < n - 1 else 0.0
        owned.append((left + right) / 2)
    return owned


def summarize(miles: Sequence[float], levels: Sequence[RiskLevel | None]) -> RouteRiskSummary:
    if len(miles) != len(levels):
        raise ValueError("miles and levels must have the same length")
    if any(b < a for a, b in zip(miles, miles[1:], strict=False)):
        raise ValueError("checkpoint miles must be ascending")

    by_level = dict.fromkeys(RiskLevel, 0.0)
    unknown = 0.0
    for length, level in zip(owned_miles(miles), levels, strict=True):
        if level is None:
            unknown += length
        else:
            by_level[level] += length

    known = sum(by_level.values())
    avg = sum(level.value * length for level, length in by_level.items()) / known if known > 0 else None
    known_levels = [level for level in levels if level is not None]
    return RouteRiskSummary(
        miles_by_level=by_level,
        unknown_miles=unknown,
        avg_risk=avg,
        max_level=max(known_levels) if known_levels else None,
    )

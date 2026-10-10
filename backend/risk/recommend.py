"""Route recommendation by strict lexicographic comparison (no weighted sum).

Gate: No Travel means the truck must not drive that stretch, so a route with any No Travel miles is never
recommended over one without. When every route has No Travel miles, the fewest of them wins.

Then the assignment's priority, in order:
1. Fewest Severe miles (counted as Severe-or-worse)
2. Fewest High miles
3. Lowest distance-weighted average risk
4. Shortest travel time

Miles are compared at 0.1 mi and average risk at 0.01 so floating-point noise never decides a ranking.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

from .aggregate import RouteRiskSummary


@dataclass(frozen=True)
class RouteCandidate:
    id: str
    label: str
    duration_s: float
    summary: RouteRiskSummary


@dataclass(frozen=True)
class Recommendation:
    route_id: str | None
    ranking: list[str]
    all_routes_unsafe: bool
    rationale: list[str]


# (name, comparison wording) for each element of rank_key, in priority order.
CRITERIA = (
    ("No Travel miles", "fewer"),
    ("Severe-or-worse miles", "fewer"),
    ("High-risk miles", "fewer"),
    ("average risk", "lower"),
    ("travel time", "shorter"),
)


def rank_key(route: RouteCandidate) -> tuple[float, float, float, float, float]:
    s = route.summary
    avg = round(s.avg_risk, 2) if s.avg_risk is not None else math.inf
    return (
        round(s.no_travel_miles, 1),
        round(s.severe_or_worse_miles, 1),
        round(s.high_miles, 1),
        avg,
        round(route.duration_s),
    )


def _fmt(criterion: int, value: float) -> str:
    if criterion <= 2:
        return f"{value:.1f} mi"
    if criterion == 3:
        return "n/a" if math.isinf(value) else f"{value:.2f}"
    hours, rem = divmod(int(value), 3600)
    return f"{hours}h {rem // 60:02d}m"


def explain(winner: RouteCandidate, other: RouteCandidate) -> str:
    """One sentence naming the first criterion that separates two routes."""
    for idx, (w, o) in enumerate(zip(rank_key(winner), rank_key(other), strict=True)):
        if w != o:
            name, wording = CRITERIA[idx]
            tied = [n for n, _ in CRITERIA[1:idx]]
            prefix = f"tied on {', '.join(tied)}; " if tied else ""
            values = f"({_fmt(idx, w)} vs {_fmt(idx, o)})"
            return f"{winner.label} beats {other.label}: {prefix}{wording} {name} {values}."
    return f"{winner.label} and {other.label} tie on every criterion; provider order is kept."


def recommend(routes: Sequence[RouteCandidate]) -> Recommendation:
    if not routes:
        return Recommendation(route_id=None, ranking=[], all_routes_unsafe=False, rationale=[])

    ranked = sorted(routes, key=rank_key)  # stable sort: full ties keep provider order
    best = ranked[0]
    all_unsafe = best.summary.unsafe  # the gate puts a safe route first whenever one exists

    rationale = []
    if all_unsafe:
        rationale.append(
            "No route is confirmed safe: every option crosses No Travel conditions. "
            f"{best.label} has the fewest No Travel miles; consider delaying departure."
        )
    if len(routes) == 1:
        rationale.append(f"{best.label} is the only route available.")
    rationale.extend(explain(best, other) for other in ranked[1:])
    if best.summary.unknown_miles > 0:
        rationale.append(
            f"{best.label} has {best.summary.unknown_miles:.1f} mi without forecast data; "
            "those miles are excluded from its risk totals."
        )
    return Recommendation(
        route_id=best.id,
        ranking=[r.id for r in ranked],
        all_routes_unsafe=all_unsafe,
        rationale=rationale,
    )

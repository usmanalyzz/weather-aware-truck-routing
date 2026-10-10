import pytest

from risk.aggregate import RouteRiskSummary, owned_miles, summarize
from risk.levels import RiskLevel as R
from risk.recommend import RouteCandidate, rank_key, recommend

L, M, H, S, N = R.LOW, R.MODERATE, R.HIGH, R.SEVERE, R.NO_TRAVEL


def summary(low=0.0, moderate=0.0, high=0.0, severe=0.0, no_travel=0.0, unknown=0.0, avg=None):
    by_level = {L: low, M: moderate, H: high, S: severe, N: no_travel}
    known = sum(by_level.values())
    if avg is None and known:
        avg = sum(level.value * miles for level, miles in by_level.items()) / known
    return RouteRiskSummary(miles_by_level=by_level, unknown_miles=unknown, avg_risk=avg, max_level=None)


def route(rid, duration_h=10.0, **kw):
    return RouteCandidate(id=rid, label=f"Route {rid}", duration_s=duration_h * 3600, summary=summary(**kw))


# --- owned miles / aggregation ---------------------------------------------------------------


def test_owned_miles_sum_to_route_length():
    miles = [0, 25, 50, 60]

    owned = owned_miles(miles)

    assert owned == pytest.approx([12.5, 25, 17.5, 5])
    assert sum(owned) == pytest.approx(60)


def test_owned_miles_degenerate():
    assert owned_miles([]) == []
    assert owned_miles([0.0]) == [0.0]


def test_summarize_distance_weighted():
    # 0 -- 25 -- 50 -- 75 -- 100 with a Severe checkpoint at 50.
    result = summarize([0, 25, 50, 75, 100], [L, M, S, M, L])

    assert result.miles_by_level[L] == pytest.approx(25)  # 12.5 + 12.5
    assert result.miles_by_level[M] == pytest.approx(50)
    assert result.severe_miles == pytest.approx(25)
    assert result.severe_or_worse_miles == pytest.approx(25)
    assert result.avg_risk == pytest.approx((0 * 25 + 1 * 50 + 3 * 25) / 100)
    assert result.max_level is S
    assert result.unsafe is False


def test_summarize_no_travel_flags_route_unsafe():
    result = summarize([0, 10, 20], [L, N, L])

    assert result.no_travel_miles == pytest.approx(10)
    assert result.severe_or_worse_miles == pytest.approx(10)
    assert result.unsafe is True
    assert result.max_level is N


def test_summarize_unknown_miles_excluded_from_average():
    result = summarize([0, 10, 20, 30], [H, None, None, L])

    assert result.unknown_miles == pytest.approx(20)
    assert result.high_miles == pytest.approx(5)
    assert result.avg_risk == pytest.approx((2 * 5 + 0 * 5) / 10)


def test_summarize_all_unknown():
    result = summarize([0, 10], [None, None])

    assert result.avg_risk is None
    assert result.max_level is None
    assert result.unknown_miles == pytest.approx(10)


def test_summarize_validation():
    with pytest.raises(ValueError):
        summarize([0, 10], [L])
    with pytest.raises(ValueError):
        summarize([0, 10, 5], [L, L, L])


# --- ranking -------------------------------------------------------------------------------


def test_fewest_severe_miles_wins_even_if_slower_and_more_high():
    a = route("A", duration_h=8, severe=10, low=90)
    b = route("B", duration_h=12, high=60, low=40)

    rec = recommend([a, b])

    assert rec.route_id == "B"
    assert "fewer Severe-or-worse miles (0.0 mi vs 10.0 mi)" in rec.rationale[0]


def test_tie_on_severe_then_fewest_high():
    a = route("A", duration_h=8, severe=5, high=20, low=75)
    b = route("B", duration_h=9, severe=5, high=10, low=85)

    rec = recommend([a, b])

    assert rec.ranking == ["B", "A"]
    assert "tied on Severe-or-worse miles; fewer High-risk miles" in rec.rationale[0]


def test_tie_on_severe_and_high_then_lowest_average_risk():
    a = route("A", duration_h=8, moderate=60, low=40)
    b = route("B", duration_h=9, moderate=20, low=80)

    rec = recommend([a, b])

    assert rec.route_id == "B"
    assert "lower average risk (0.20 vs 0.60)" in rec.rationale[0]


def test_full_risk_tie_then_shortest_time():
    a = route("A", duration_h=10.5, low=100)
    b = route("B", duration_h=9.75, low=100)

    rec = recommend([a, b])

    assert rec.route_id == "B"
    assert "shorter travel time (9h 45m vs 10h 30m)" in rec.rationale[0]


def test_lexicographic_order_cannot_be_overridden_by_large_later_differences():
    # B is hugely faster and lower-average but has 0.2 more Severe-or-worse miles.
    a = route("A", duration_h=30, severe=1.0, high=99)
    b = route("B", duration_h=5, severe=1.2, low=98.8)

    assert recommend([a, b]).route_id == "A"


def test_float_noise_does_not_decide_ranking():
    a = route("A", duration_h=9, severe=10.000000001, low=90)
    b = route("B", duration_h=10, severe=10.0, low=90)

    assert recommend([a, b]).route_id == "A"  # equal at 0.1 mi -> faster route wins


def test_no_travel_route_never_beats_travelable_route():
    a = route("A", duration_h=8, no_travel=5, low=95)
    b = route("B", duration_h=12, severe=40, low=60)

    rec = recommend([a, b])

    assert rec.route_id == "B"
    assert rec.all_routes_unsafe is False
    assert "fewer No Travel miles" in rec.rationale[0]


def test_all_routes_unsafe_is_reported_and_fewest_no_travel_wins():
    a = route("A", no_travel=30, low=70)
    b = route("B", no_travel=10, severe=50, low=40)

    rec = recommend([a, b])

    assert rec.all_routes_unsafe is True
    assert rec.route_id == "B"
    assert rec.rationale[0].startswith("No route is confirmed safe")


def test_full_tie_keeps_provider_order():
    a, b = route("A", low=100), route("B", low=100)

    rec = recommend([a, b])

    assert rec.ranking == ["A", "B"]
    assert "tie on every criterion" in rec.rationale[0]


def test_three_routes_ranking_and_rationale_per_runner_up():
    a = route("A", duration_h=9, severe=12.5, low=87.5)
    b = route("B", duration_h=10, high=30, low=70)
    c = route("C", duration_h=11, severe=37, low=63)

    rec = recommend([a, b, c])

    assert rec.ranking == ["B", "A", "C"]
    assert len(rec.rationale) == 2


def test_single_route_and_unknown_miles_are_explained():
    rec = recommend([route("A", low=80, unknown=20)])

    assert rec.route_id == "A"
    assert any("only route" in line for line in rec.rationale)
    assert any("20.0 mi without forecast data" in line for line in rec.rationale)


def test_route_without_any_forecast_ranks_after_routes_with_data():
    a = route("A", unknown=100)
    b = route("B", moderate=100)

    assert rank_key(a)[3] == float("inf")
    assert recommend([a, b]).route_id == "B"


def test_no_routes():
    rec = recommend([])

    assert rec.route_id is None
    assert rec.ranking == []

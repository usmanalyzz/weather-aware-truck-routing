import pytest

from routing.dedupe import distinct_indices, is_duplicate, overlap
from routing.geometry import cumulative_miles
from routing.simplify import simplify
from tests.factories import dogleg, line

CHI, DEN = (41.88, -87.63), (39.74, -104.99)


def test_identical_and_nearly_identical_routes_are_duplicates():
    a = line(CHI, DEN, 300)
    b = [(lat + 0.002, lon) for lat, lon in a]  # ~0.14 mi parallel offset

    assert overlap(a, b) == 1.0
    assert is_duplicate(a, b)


def test_genuinely_different_routes_are_distinct():
    a = line(CHI, DEN, 300)
    b = dogleg(CHI, DEN, via=(43.0, -96.0))

    assert not is_duplicate(a, b)


def test_shared_start_but_different_majority_is_distinct():
    a = line(CHI, DEN, 300)
    b = dogleg(CHI, DEN, via=(40.9, -95.0))  # stays near `a` for a while, then diverges

    assert overlap(a, b) < 0.9


def test_distinct_indices_keeps_provider_order_and_limit():
    a = line(CHI, DEN, 300)
    dup = [(lat + 0.001, lon) for lat, lon in a]
    north = dogleg(CHI, DEN, via=(43.0, -96.0))
    south = dogleg(CHI, DEN, via=(38.5, -95.0))
    far_south = dogleg(CHI, DEN, via=(37.0, -96.0))

    assert distinct_indices([a, dup, north, south, far_south], limit=3) == [0, 2, 3]
    assert distinct_indices([a, dup], limit=3) == [0]


def test_simplify_keeps_shape_and_endpoints():
    straight = line(CHI, DEN, 500)
    bent = dogleg(CHI, DEN, via=(43.0, -96.0), steps=200)

    assert simplify(straight) == [straight[0], straight[-1]]
    simplified = simplify(bent)
    assert simplified[0] == bent[0] and simplified[-1] == bent[-1]
    assert (43.0, -96.0) in simplified
    assert len(simplified) == 3
    # Display-only geometry: length within 0.1% (risk and distance always use the full polyline).
    assert cumulative_miles(simplified)[-1] == pytest.approx(cumulative_miles(bent)[-1], rel=1e-3)


def test_simplify_small_inputs_and_zero_length_segment():
    assert simplify([]) == []
    assert simplify([(1.0, 1.0), (2.0, 2.0)]) == [(1.0, 1.0), (2.0, 2.0)]
    loop = [(1.0, 1.0), (1.5, 1.2), (1.0, 1.0)]  # closed loop: first == last
    assert simplify(loop) == loop

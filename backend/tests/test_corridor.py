import pytest

from risk.levels import RiskLevel
from risk.rules import THRESHOLDS, classify_rain, classify_snow, classify_wind
from routing.corridor import corridor_grid
from routing.geometry import haversine_miles
from tests.factories import dogleg, line

CHI, DEN = (41.88, -87.63), (39.74, -104.99)


def min_distance(point, route):
    return min(haversine_miles(point, q) for q in route)


def test_grid_stays_within_corridor_and_covers_route():
    route = line(CHI, DEN, 600)

    grid = corridor_grid([route], spacing_mi=15, radius_mi=40)

    assert grid.points
    # Every grid point is near the route (radius + half the route sampling step).
    assert max(min_distance(p, route) for p in grid.points) <= 40 + 2.5 + 0.01
    # Every stretch of the route has a grid point within ~one grid diagonal.
    for q in route[::20]:
        assert min(haversine_miles(q, p) for p in grid.points) <= 15 * 0.75


def test_grid_spacing_is_roughly_uniform_in_miles():
    grid = corridor_grid([line(CHI, DEN, 600)], spacing_mi=15, radius_mi=40)

    nearest = [min(haversine_miles(p, q) for q in grid.points if q != p) for p in grid.points[:50]]

    assert min(nearest) == pytest.approx(15, rel=0.1)
    assert max(nearest) == pytest.approx(15, rel=0.15)


def test_grid_covers_all_routes():
    north = dogleg(CHI, DEN, via=(43.5, -96.0))
    south = dogleg(CHI, DEN, via=(38.0, -95.0))

    grid = corridor_grid([north, south], spacing_mi=15, radius_mi=40)

    assert any(min_distance(p, [(43.5, -96.0)]) < 15 for p in grid.points)
    assert any(min_distance(p, [(38.0, -95.0)]) < 15 for p in grid.points)


def test_grid_is_bounded_by_widening_spacing():
    routes = [dogleg(CHI, DEN, via=(45.0, -96.0)), dogleg(CHI, DEN, via=(36.0, -95.0))]

    grid = corridor_grid(routes, spacing_mi=5, radius_mi=40, max_points=300)

    assert len(grid.points) <= 300
    assert grid.spacing_mi > 5


def test_grid_requires_routes():
    with pytest.raises(ValueError):
        corridor_grid([])
    with pytest.raises(ValueError):
        corridor_grid([[(1.0, 1.0)]])


@pytest.mark.parametrize(
    ("metric", "classify"),
    [("wind_mph", classify_wind), ("rain_in_hr", classify_rain), ("snow_in_hr", classify_snow)],
)
def test_published_thresholds_match_rules(metric, classify):
    spec = THRESHOLDS[metric]
    *lower, no_travel = spec["values"]
    for level, bound in zip((RiskLevel.MODERATE, RiskLevel.HIGH, RiskLevel.SEVERE), lower, strict=True):
        assert classify(bound) is level
        assert classify(bound - 1e-6) is RiskLevel(level - 1)
    expected = RiskLevel.NO_TRAVEL if spec["no_travel_inclusive"] else RiskLevel.SEVERE
    assert classify(no_travel) is expected
    assert classify(no_travel + 1e-6) is RiskLevel.NO_TRAVEL

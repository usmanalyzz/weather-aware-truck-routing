import math
from datetime import UTC, datetime, timedelta

import pytest

from routing.checkpoints import build_checkpoints, checkpoint_miles
from routing.eta import Span, time_at_mile, vertex_times
from routing.geometry import EARTH_RADIUS_MI, cumulative_miles, haversine_miles, locate, point_at_mile

MILES_PER_DEG_LAT = 2 * math.pi * EARTH_RADIUS_MI / 360
DEPARTURE = datetime(2026, 10, 12, 11, 0, tzinfo=UTC)


def meridian(start_lat=35.0, end_lat=36.0, steps=100, lon=-100.0):
    """A straight north-bound polyline of known length (~69.1 mi for one degree)."""
    return [(start_lat + (end_lat - start_lat) * i / steps, lon) for i in range(steps + 1)]


# --- geometry -----------------------------------------------------------------


def test_haversine_known_distance_chicago_denver():
    # Great-circle distance Chicago -> Denver is ~920 mi.
    assert haversine_miles((41.8781, -87.6298), (39.7392, -104.9903)) == pytest.approx(920, abs=5)


def test_cumulative_miles_on_meridian():
    cum = cumulative_miles(meridian())

    assert cum[0] == 0
    assert cum[-1] == pytest.approx(MILES_PER_DEG_LAT, rel=1e-6)
    assert all(b >= a for a, b in zip(cum, cum[1:], strict=False))


def test_locate_and_point_at_mile_interpolate_between_vertices():
    coords = [(0.0, 0.0), (1.0, 0.0)]
    cum = cumulative_miles(coords)

    assert locate(cum, cum[-1] / 4) == (0, pytest.approx(0.25))
    assert point_at_mile(coords, cum, cum[-1] / 2) == pytest.approx((0.5, 0.0))
    # Clamped to the ends.
    assert point_at_mile(coords, cum, -5) == (0.0, 0.0)
    assert point_at_mile(coords, cum, 10_000) == pytest.approx((1.0, 0.0))


def test_empty_and_single_point_geometry():
    assert cumulative_miles([]) == []
    assert cumulative_miles([(1.0, 2.0)]) == [0.0]
    assert locate([0.0], 3) == (0, 0.0)
    assert point_at_mile([(1.0, 2.0)], [0.0], 3) == (1.0, 2.0)


# --- checkpoint miles -----------------------------------------------------------


@pytest.mark.parametrize(
    ("total", "interval", "expected"),
    [
        (100, 25, [0, 25, 50, 75, 100]),  # exact multiple: destination not duplicated
        (60, 25, [0, 25, 50, 60]),  # short final gap
        (8, 10, [0, 8]),  # route shorter than interval
        (0, 10, [0]),
        (120.5, 50, [0, 50, 100, 120.5]),
    ],
)
def test_checkpoint_miles(total, interval, expected):
    assert checkpoint_miles(total, interval) == pytest.approx(expected)


def test_checkpoint_interval_must_be_positive():
    with pytest.raises(ValueError):
        checkpoint_miles(100, 0)


@pytest.mark.parametrize("interval", [10, 25, 50])
def test_checkpoint_spacing_along_geometry(interval):
    coords = meridian(35.0, 37.0, steps=200)  # ~138 mi
    cum = cumulative_miles(coords)
    times = vertex_times(cum, [], total_duration_s=3 * 3600)

    cps = build_checkpoints(coords, cum, times, DEPARTURE, interval)

    # Spacing measured on the ground matches the interval (straight line: road == great circle).
    for a, b in zip(cps[:-2], cps[1:-1], strict=False):
        assert haversine_miles((a.lat, a.lon), (b.lat, b.lon)) == pytest.approx(interval, abs=0.05)
    assert (cps[0].lat, cps[0].lon) == coords[0]
    assert (cps[-1].lat, cps[-1].lon) == pytest.approx(coords[-1])
    assert cps[-1].mile == pytest.approx(cum[-1])
    assert [c.seq for c in cps] == list(range(len(cps)))


# --- ETA ------------------------------------------------------------------------------


def test_uniform_eta_without_spans_ends_at_route_duration():
    coords = meridian()
    cum = cumulative_miles(coords)
    times = vertex_times(cum, [], total_duration_s=3600)

    assert times[0] == 0
    assert times[-1] == pytest.approx(3600)
    assert time_at_mile(cum, times, cum[-1] / 2) == pytest.approx(1800)


def test_span_durations_drive_eta():
    # Two equal-length halves: first half slow (city, 2 h), second half fast (interstate, 1 h).
    coords = meridian(steps=100)
    cum = cumulative_miles(coords)
    spans = [Span(offset=0, duration_s=7200), Span(offset=50, duration_s=3600)]

    times = vertex_times(cum, spans, total_duration_s=10_800)

    assert times[50] == pytest.approx(7200)
    assert times[-1] == pytest.approx(10_800)
    assert time_at_mile(cum, times, cum[-1] / 4) == pytest.approx(3600, rel=1e-6)
    assert time_at_mile(cum, times, cum[-1] * 3 / 4) == pytest.approx(9000, rel=1e-6)


def test_checkpoint_etas_use_span_times():
    coords = meridian(steps=100)
    cum = cumulative_miles(coords)
    times = vertex_times(cum, [Span(0, 7200), Span(50, 3600)], 10_800)

    cps = build_checkpoints(coords, cum, times, DEPARTURE, 25)

    assert cps[0].eta == DEPARTURE
    assert cps[-1].eta == pytest.approx(DEPARTURE + timedelta(seconds=10_800), abs=timedelta(seconds=1))
    assert all(a.eta <= b.eta for a, b in zip(cps, cps[1:], strict=False))


def test_zero_length_span_and_unsorted_spans():
    cum = [0.0, 1.0, 1.0, 2.0]  # a duplicated vertex (zero-length segment)
    times = vertex_times(cum, [Span(2, 60), Span(0, 60)], 120)

    assert times == pytest.approx([0, 60, 60, 120])


@pytest.mark.parametrize("spans", [[Span(1, 10)], [Span(0, 10), Span(9, 10)]])
def test_invalid_spans_rejected(spans):
    with pytest.raises(ValueError):
        vertex_times([0.0, 1.0, 2.0], spans, 20)


def test_eta_helpers_on_degenerate_geometry():
    assert vertex_times([], [], 100) == []
    assert time_at_mile([0.0], [0.0], 5) == 0.0

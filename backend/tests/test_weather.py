from datetime import UTC, datetime, timedelta, timezone

import pytest

from weather.matching import HourlySeries, ceil_hour, floor_hour, sample_at, series_from_metric
from weather.units import cm_to_in, kmh_to_mph, lb_to_kg, mm_to_in, ms_to_mph

START = datetime(2026, 10, 12, 0, 0, tzinfo=UTC)


def series(n=6, **overrides):
    data = {
        "wind_mph": [10.0 * i for i in range(n)],  # 0, 10, 20, ...
        "gust_mph": [15.0 * i for i in range(n)],
        "rain_in": [0.01 * i for i in range(n)],
        "snow_in": [0.1 * i for i in range(n)],
    }
    data.update(overrides)
    return HourlySeries(start=START, **data)


# --- units ----------------------------------------------------------------------------


def test_unit_conversions():
    assert kmh_to_mph(88.51392) == pytest.approx(55.0)
    assert ms_to_mph(20.1168) == pytest.approx(45.0)
    assert mm_to_in(25.4) == pytest.approx(1.0)
    assert mm_to_in(2.54) == pytest.approx(0.10)
    assert cm_to_in(5.08) == pytest.approx(2.0)
    assert lb_to_kg(80_000) == pytest.approx(36_287.39, abs=0.01)


def test_series_from_metric_converts_and_keeps_missing():
    s = series_from_metric(START, [40.2336, None], [0, 0], [2.54, 0], [2.54, None])

    assert s.wind_mph[0] == pytest.approx(25.0)
    assert s.wind_mph[1] is None
    assert s.rain_in[0] == pytest.approx(0.1)
    assert s.snow_in[0] == pytest.approx(1.0)
    assert s.snow_in[1] is None


# --- hour rounding -------------------------------------------------------------------------


def test_floor_and_ceil_hour_normalize_to_utc():
    t = datetime(2026, 10, 12, 1, 30, tzinfo=timezone(timedelta(hours=-5)))  # 06:30 UTC

    assert floor_hour(t) == datetime(2026, 10, 12, 6, tzinfo=UTC)
    assert ceil_hour(t) == datetime(2026, 10, 12, 7, tzinfo=UTC)
    assert ceil_hour(START) == START


# --- matching ------------------------------------------------------------------------------


def test_eta_between_hours_uses_next_hour_precip_and_interpolated_wind():
    sample = sample_at(series(), START + timedelta(hours=2, minutes=15))

    assert sample is not None
    assert sample.time == START + timedelta(hours=3)
    assert sample.wind_mph == pytest.approx(22.5)  # 20 -> 30 mph, a quarter of the way
    assert sample.rain_in_hr == pytest.approx(0.03)  # window 02:00-03:00
    assert sample.snow_in_hr == pytest.approx(0.3)
    assert sample.gust_mph == pytest.approx(45.0)


def test_eta_exactly_on_hour_uses_that_record():
    sample = sample_at(series(), START + timedelta(hours=4))

    assert sample.time == START + timedelta(hours=4)
    assert sample.wind_mph == pytest.approx(40.0)
    assert sample.rain_in_hr == pytest.approx(0.04)


def test_eta_in_other_timezone_matches_utc_record():
    eta = datetime(2026, 10, 11, 21, 30, tzinfo=timezone(timedelta(hours=-5)))  # 02:30 UTC

    assert sample_at(series(), eta).time == START + timedelta(hours=3)


@pytest.mark.parametrize(
    "eta",
    [
        START - timedelta(minutes=30),  # before the series
        START + timedelta(hours=5, minutes=1),  # needs 06:00 which is beyond the horizon
    ],
)
def test_eta_outside_series_is_unavailable(eta):
    assert sample_at(series(), eta) is None


def test_missing_values_make_sample_unavailable():
    assert sample_at(series(wind_mph=[0, None, 20, 30, 40, 50]), START + timedelta(minutes=30)) is None
    assert sample_at(series(rain_in=[0, 0, None, 0, 0, 0]), START + timedelta(hours=1, minutes=5)) is None
    assert sample_at(series(snow_in=[0, 0, None, 0, 0, 0]), START + timedelta(hours=2)) is None


def test_missing_gust_is_allowed():
    sample = sample_at(series(gust_mph=[None] * 6), START + timedelta(hours=1))

    assert sample is not None
    assert sample.gust_mph is None


def test_series_validation():
    with pytest.raises(ValueError):
        HourlySeries(start=datetime(2026, 1, 1), wind_mph=[], gust_mph=[], rain_in=[], snow_in=[])
    with pytest.raises(ValueError):
        HourlySeries(start=START, wind_mph=[1], gust_mph=[], rain_in=[], snow_in=[])


def test_index_of_rejects_non_hour_times():
    s = series()

    assert s.index_of(START + timedelta(minutes=30)) is None
    assert s.index_of(START + timedelta(hours=2)) == 2
    assert s.end() == START + timedelta(hours=5)

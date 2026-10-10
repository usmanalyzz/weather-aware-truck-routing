import math

import pytest

from risk.levels import RiskLevel as R
from risk.rules import (
    Conditions,
    assess,
    classify_load,
    classify_rain,
    classify_snow,
    classify_wind,
)


@pytest.mark.parametrize(
    ("mph", "expected"),
    [
        (0, R.LOW),
        (24.99, R.LOW),
        (25, R.MODERATE),
        (34.99, R.MODERATE),
        (35, R.HIGH),
        (44.99, R.HIGH),
        (45, R.SEVERE),
        (54.99, R.SEVERE),
        (55, R.NO_TRAVEL),
        (80, R.NO_TRAVEL),
    ],
)
def test_wind_thresholds(mph, expected):
    assert classify_wind(mph) is expected


@pytest.mark.parametrize(
    ("inches", "expected"),
    [
        (0, R.LOW),
        (0.099, R.LOW),
        (0.10, R.MODERATE),
        (0.249, R.MODERATE),
        (0.25, R.HIGH),
        (0.499, R.HIGH),
        (0.50, R.SEVERE),
        (1.00, R.SEVERE),  # Severe is inclusive of 1.00
        (1.001, R.NO_TRAVEL),
        (2.5, R.NO_TRAVEL),
    ],
)
def test_rain_thresholds(inches, expected):
    assert classify_rain(inches) is expected


@pytest.mark.parametrize(
    ("inches", "expected"),
    [
        (0, R.LOW),
        (0.499, R.LOW),
        (0.5, R.MODERATE),
        (0.999, R.MODERATE),
        (1.0, R.HIGH),
        (1.999, R.HIGH),
        (2.0, R.SEVERE),
        (3.0, R.SEVERE),  # Severe is inclusive of 3.0
        (3.001, R.NO_TRAVEL),
    ],
)
def test_snow_thresholds(inches, expected):
    assert classify_snow(inches) is expected


@pytest.mark.parametrize(
    ("mph", "load", "expected"),
    [
        # >= 55 mph: No Travel for any load
        (55, 0, R.NO_TRAVEL),
        (60, 1, R.NO_TRAVEL),
        # 45-54 mph: No Travel only above 30,000 lb
        (45, 30_000, R.LOW),
        (45, 30_001, R.NO_TRAVEL),
        (54.99, 30_001, R.NO_TRAVEL),
        (44.99, 30_001, R.LOW),
        # 35-44 mph: Severe only above 40,000 lb
        (35, 40_000, R.LOW),
        (35, 40_001, R.SEVERE),
        (44.99, 40_001, R.SEVERE),
        (34.99, 40_001, R.LOW),
        # 45-54 mph with > 40,000 lb is still No Travel (the stricter rule wins)
        (50, 45_000, R.NO_TRAVEL),
    ],
)
def test_load_rules(mph, load, expected):
    assert classify_load(mph, load) is expected


def test_calm_weather_is_low_with_no_factors():
    result = assess(Conditions(wind_mph=10, rain_in_hr=0.01, snow_in_hr=0), load_lb=45_000)

    assert result.level is R.LOW
    assert result.factors == {}


def test_load_override_raises_high_wind_to_severe():
    result = assess(Conditions(wind_mph=38, rain_in_hr=0, snow_in_hr=0), load_lb=42_000)

    assert result.level is R.SEVERE
    assert result.factors == {"wind": R.HIGH, "load": R.SEVERE}


def test_same_wind_light_load_stays_high():
    result = assess(Conditions(wind_mph=38, rain_in_hr=0, snow_in_hr=0), load_lb=20_000)

    assert result.level is R.HIGH


def test_severe_wind_heavy_load_is_no_travel():
    result = assess(Conditions(wind_mph=47, rain_in_hr=0, snow_in_hr=0), load_lb=35_000)

    assert result.level is R.NO_TRAVEL
    assert result.factors["load"] is R.NO_TRAVEL


def test_highest_condition_wins_when_combined():
    result = assess(Conditions(wind_mph=26, rain_in_hr=0.3, snow_in_hr=2.1), load_lb=10_000)

    assert result.level is R.SEVERE
    assert result.factors == {"wind": R.MODERATE, "rain": R.HIGH, "snow": R.SEVERE}


def test_heavy_rain_alone_is_no_travel_regardless_of_load():
    result = assess(Conditions(wind_mph=0, rain_in_hr=1.2, snow_in_hr=0), load_lb=0)

    assert result.level is R.NO_TRAVEL


@pytest.mark.parametrize("bad", [-0.1, math.nan, math.inf])
def test_invalid_values_are_rejected(bad):
    with pytest.raises(ValueError):
        classify_wind(bad)
    with pytest.raises(ValueError):
        classify_rain(bad)
    with pytest.raises(ValueError):
        classify_snow(bad)
    with pytest.raises(ValueError):
        classify_load(10, bad)


def test_level_order_and_scores():
    assert [level.value for level in R] == [0, 1, 2, 3, 4]
    assert R.NO_TRAVEL.label == "No Travel"

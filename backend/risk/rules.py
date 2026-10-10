"""Checkpoint weather-risk rules, implemented exactly as specified by the assignment.

Units: wind in mph (sustained), rain and snow in inches per hour, load in pounds.

| Level     | Wind      | Rain           | Snow         |
|-----------|-----------|----------------|--------------|
| Low       | < 25      | < 0.10         | < 0.5        |
| Moderate  | 25 - <35  | 0.10 - <0.25   | 0.5 - <1.0   |
| High      | 35 - <45  | 0.25 - <0.50   | 1.0 - <2.0   |
| Severe    | 45 - <55  | 0.50 - 1.00    | 2.0 - 3.0    |
| No Travel | >= 55     | > 1.00         | > 3.0        |

Load rules (wind-dependent):
* wind >= 55              -> No Travel for any load
* 45 <= wind < 55 and load > 30,000 lb -> No Travel
* 35 <= wind < 45 and load > 40,000 lb -> at least Severe

The checkpoint level is the highest level produced by any rule.
"""

import math
from dataclasses import dataclass

from .levels import RiskLevel

# Lower bounds of Moderate, High, Severe and No Travel, published to the UI for legends.
# The classify_* functions below are the source of truth; tests keep these in sync with them.
THRESHOLDS = {
    "wind_mph": {"values": [25, 35, 45, 55], "no_travel_inclusive": True},
    "rain_in_hr": {"values": [0.10, 0.25, 0.50, 1.00], "no_travel_inclusive": False},
    "snow_in_hr": {"values": [0.5, 1.0, 2.0, 3.0], "no_travel_inclusive": False},
}


@dataclass(frozen=True)
class Conditions:
    wind_mph: float
    rain_in_hr: float
    snow_in_hr: float


@dataclass(frozen=True)
class Assessment:
    level: RiskLevel
    # Every rule that raised risk above Low, e.g. {"wind": HIGH, "load": SEVERE}.
    factors: dict[str, RiskLevel]


def _check(name: str, value: float) -> None:
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"{name} must be a finite, non-negative number, got {value!r}")


def classify_wind(wind_mph: float) -> RiskLevel:
    _check("wind_mph", wind_mph)
    if wind_mph >= 55:
        return RiskLevel.NO_TRAVEL
    if wind_mph >= 45:
        return RiskLevel.SEVERE
    if wind_mph >= 35:
        return RiskLevel.HIGH
    if wind_mph >= 25:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def classify_rain(rain_in_hr: float) -> RiskLevel:
    _check("rain_in_hr", rain_in_hr)
    if rain_in_hr > 1.00:
        return RiskLevel.NO_TRAVEL
    if rain_in_hr >= 0.50:
        return RiskLevel.SEVERE
    if rain_in_hr >= 0.25:
        return RiskLevel.HIGH
    if rain_in_hr >= 0.10:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def classify_snow(snow_in_hr: float) -> RiskLevel:
    _check("snow_in_hr", snow_in_hr)
    if snow_in_hr > 3.0:
        return RiskLevel.NO_TRAVEL
    if snow_in_hr >= 2.0:
        return RiskLevel.SEVERE
    if snow_in_hr >= 1.0:
        return RiskLevel.HIGH
    if snow_in_hr >= 0.5:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def classify_load(wind_mph: float, load_lb: float) -> RiskLevel:
    """Minimum level imposed by the wind/load combination (Low when no load rule applies)."""
    _check("wind_mph", wind_mph)
    _check("load_lb", load_lb)
    if wind_mph >= 55:
        return RiskLevel.NO_TRAVEL
    if wind_mph >= 45 and load_lb > 30_000:
        return RiskLevel.NO_TRAVEL
    if wind_mph >= 35 and load_lb > 40_000:
        return RiskLevel.SEVERE
    return RiskLevel.LOW


def assess(conditions: Conditions, load_lb: float) -> Assessment:
    levels = {
        "wind": classify_wind(conditions.wind_mph),
        "rain": classify_rain(conditions.rain_in_hr),
        "snow": classify_snow(conditions.snow_in_hr),
        "load": classify_load(conditions.wind_mph, load_lb),
    }
    factors = {name: level for name, level in levels.items() if level > RiskLevel.LOW}
    return Assessment(level=max(levels.values()), factors=factors)

"""Pick the forecast that applies at a checkpoint's estimated arrival time.

Open-Meteo hourly semantics:
* `rain`, `showers`, `snowfall` are sums over the *preceding* hour, so the record stamped HH:00 covers
  (HH-1:00, HH:00]. For an ETA we use the record whose window contains it: the ETA rounded *up* to the hour.
* `wind_speed_10m` is an instantaneous value at HH:00, so it is linearly interpolated between the two
  surrounding hours.
* `wind_gusts_10m` is the preceding-hour maximum, matched like precipitation (informational only).

If any required value is missing (outside the forecast horizon or null), the sample is unavailable.
We never fall back to current conditions.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from .units import cm_to_in, kmh_to_mph, mm_to_in

HOUR = timedelta(hours=1)


@dataclass(frozen=True)
class HourlySeries:
    """Consecutive hourly UTC records for one location. Values are mph and inches; None means missing."""

    start: datetime  # timestamp of index 0, on the hour, timezone-aware
    wind_mph: Sequence[float | None]
    gust_mph: Sequence[float | None]
    rain_in: Sequence[float | None]  # liquid rain + showers over the preceding hour
    snow_in: Sequence[float | None]  # snowfall over the preceding hour

    def __post_init__(self) -> None:
        if self.start.tzinfo is None:
            raise ValueError("HourlySeries.start must be timezone-aware")
        lengths = {len(self.wind_mph), len(self.gust_mph), len(self.rain_in), len(self.snow_in)}
        if len(lengths) != 1:
            raise ValueError("HourlySeries arrays must have equal length")

    def __len__(self) -> int:
        return len(self.wind_mph)

    def index_of(self, hour: datetime) -> int | None:
        offset = (hour - self.start) / HOUR
        idx = int(round(offset))
        if abs(offset - idx) > 1e-9 or not 0 <= idx < len(self):
            return None
        return idx

    def end(self) -> datetime:
        return self.start + (len(self) - 1) * HOUR


@dataclass(frozen=True)
class WeatherSample:
    time: datetime  # forecast hour used for the precipitation window (end of window)
    wind_mph: float
    gust_mph: float | None
    rain_in_hr: float
    snow_in_hr: float


def floor_hour(t: datetime) -> datetime:
    return t.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def ceil_hour(t: datetime) -> datetime:
    floored = floor_hour(t)
    return floored if floored == t.astimezone(UTC) else floored + HOUR


def sample_at(series: HourlySeries, eta: datetime) -> WeatherSample | None:
    lower, upper = floor_hour(eta), ceil_hour(eta)
    i_lo, i_hi = series.index_of(lower), series.index_of(upper)
    if i_lo is None or i_hi is None:
        return None

    w_lo, w_hi = series.wind_mph[i_lo], series.wind_mph[i_hi]
    rain, snow = series.rain_in[i_hi], series.snow_in[i_hi]
    if w_lo is None or w_hi is None or rain is None or snow is None:
        return None

    fraction = (eta.astimezone(UTC) - lower) / HOUR
    wind = w_lo + (w_hi - w_lo) * fraction
    return WeatherSample(
        time=upper,
        wind_mph=max(0.0, wind),
        gust_mph=series.gust_mph[i_hi],
        rain_in_hr=max(0.0, rain),
        snow_in_hr=max(0.0, snow),
    )


def series_from_metric(
    start: datetime,
    wind_kmh: Sequence[float | None],
    gust_kmh: Sequence[float | None],
    rain_mm: Sequence[float | None],
    snow_cm: Sequence[float | None],
) -> HourlySeries:
    """Build a series from metric provider units (km/h, mm, cm of snow)."""

    def conv(values, fn):
        return [None if v is None else fn(v) for v in values]

    return HourlySeries(
        start=start,
        wind_mph=conv(wind_kmh, kmh_to_mph),
        gust_mph=conv(gust_kmh, kmh_to_mph),
        rain_in=conv(rain_mm, mm_to_in),
        snow_in=conv(snow_cm, cm_to_in),
    )

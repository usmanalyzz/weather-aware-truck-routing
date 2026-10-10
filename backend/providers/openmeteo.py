"""Open-Meteo hourly forecast client (no API key; CC-BY 4.0 attribution shown in the UI).

* Points are snapped to a 0.05° grid (~3.5 mi), finer than the underlying HRRR (3 km) / GFS (~13 km)
  models, so nearby checkpoints share one forecast and one cache entry.
* Up to BATCH_SIZE coordinates go in one request (comma-separated lat/lon lists).
* **Cache per cell and UTC day**, keyed with the current hour (the model refresh bucket). Any trip
  that crosses the same cells on the same days within the hour reuses them, whatever its exact
  departure, and nothing is served after it goes stale.
* **Rate budget:** Open-Meteo counts every location toward its free limit (600/minute), so each batch
  reserves its locations in a sliding window first (see ratelimit.py). Too long a wait, or a 429 from
  the provider, becomes a clear WEATHER_BUSY error.
* Requests are clamped to the forecast horizon; hours beyond it stay missing and become "Unknown".
"""

import logging
from collections import defaultdict
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.core.cache import cache

from routing.geometry import LatLon
from weather.matching import HOUR, HourlySeries, floor_hour

from .errors import ProviderError, WeatherBusy, WeatherUnavailable
from .http import get_json
from .ratelimit import BudgetExceeded, LocationBudget

logger = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY_VARS = "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall"
CELL_DEG = 0.05
BATCH_SIZE = 50
MAX_WORKERS = 4
FORECAST_DAYS = 16
CACHE_TTL_S = 60 * 60
DAY = timedelta(days=1)

budget = LocationBudget(
    per_minute=getattr(settings, "OPEN_METEO_LOCATIONS_PER_MINUTE", 570),
    max_wait_s=getattr(settings, "OPEN_METEO_MAX_WAIT_S", 15.0),
)


@dataclass
class ForecastResult:
    series: dict[LatLon, HourlySeries] = field(default_factory=dict)
    failed_cells: int = 0


def snap(point: LatLon) -> LatLon:
    lat, lon = point
    return round(round(lat / CELL_DEG) * CELL_DEG, 4), round(round(lon / CELL_DEG) * CELL_DEG, 4)


def forecast_horizon(now: datetime) -> datetime:
    """Last hour the provider will serve: the end of day `FORECAST_DAYS` counting today (UTC)."""
    today = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    return today + timedelta(days=FORECAST_DAYS) - HOUR


def _day_key(cell: LatLon, day: datetime, now: datetime) -> str:
    return f"om:v2:{cell[0]:.4f}:{cell[1]:.4f}:{day:%Y%m%d}:{now:%Y%m%d%H}"


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value).replace(tzinfo=UTC)


def parse_location(payload: dict) -> HourlySeries:
    hourly = payload["hourly"]
    times = hourly["time"]
    if not times:
        raise ValueError("empty hourly series")
    rain = [
        None if r is None or s is None else r + s
        for r, s in zip(hourly["rain"], hourly["showers"], strict=True)
    ]
    return HourlySeries(
        start=_parse_time(times[0]),
        wind_mph=hourly["wind_speed_10m"],
        gust_mph=hourly["wind_gusts_10m"],
        rain_in=rain,
        snow_in=hourly["snowfall"],
    )


def _fetch_batch(
    cells: list[LatLon], start: datetime, end: datetime, max_wait_s: float | None = None
) -> list[HourlySeries]:
    try:
        budget.acquire(len(cells), max_wait_s)
    except BudgetExceeded as exc:
        raise WeatherBusy(str(exc)) from exc
    params = {
        "latitude": ",".join(f"{c[0]:.4f}" for c in cells),
        "longitude": ",".join(f"{c[1]:.4f}" for c in cells),
        "hourly": HOURLY_VARS,
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "GMT",
        "start_hour": start.strftime("%Y-%m-%dT%H:%M"),
        "end_hour": end.strftime("%Y-%m-%dT%H:%M"),
    }
    data = get_json(FORECAST_URL, params, error_cls=WeatherUnavailable, busy_cls=WeatherBusy)
    payloads = data if isinstance(data, list) else [data]
    if len(payloads) != len(cells):
        raise WeatherUnavailable(f"expected {len(cells)} locations, got {len(payloads)}")
    return [parse_location(p) for p in payloads]


def _slice(series: HourlySeries, start: datetime, hours: int) -> HourlySeries | None:
    i = series.index_of(start)
    if i is None:
        return None
    j = min(i + hours, len(series))
    return HourlySeries(
        start=start,
        wind_mph=list(series.wind_mph[i:j]),
        gust_mph=list(series.gust_mph[i:j]),
        rain_in=list(series.rain_in[i:j]),
        snow_in=list(series.snow_in[i:j]),
    )


def _concat(chunks: list[HourlySeries]) -> HourlySeries:
    return HourlySeries(
        start=chunks[0].start,
        wind_mph=[v for c in chunks for v in c.wind_mph],
        gust_mph=[v for c in chunks for v in c.gust_mph],
        rain_in=[v for c in chunks for v in c.rain_in],
        snow_in=[v for c in chunks for v in c.snow_in],
    )


def fetch_forecasts(
    points: Iterable[LatLon],
    start: datetime,
    end: datetime,
    now: datetime | None = None,
    max_wait_s: float | None = None,
) -> ForecastResult:
    """Hourly series per snapped cell covering whole UTC days from `start`'s day through `end`'s day
    (clamped to the forecast horizon). Raises WeatherUnavailable / WeatherBusy only if nothing loads.

    `max_wait_s` overrides how long batches may wait for rate budget (the background heatmap can
    afford to wait longer than an interactive plan request).
    """
    now = floor_hour(now or datetime.now(UTC))
    horizon = forecast_horizon(now)
    start = max(floor_hour(start), now - timedelta(days=2))
    end = min(floor_hour(end), horizon)
    cells = sorted({snap(p) for p in points})
    result = ForecastResult()
    if not cells or start > end:
        return result  # nothing requested inside the forecast horizon

    first_day = start.replace(hour=0)
    days = [first_day + i * DAY for i in range((end.replace(hour=0) - first_day).days + 1)]
    keys = {(cell, day): _day_key(cell, day, now) for cell in cells for day in days}
    cached = cache.get_many(list(keys.values()))
    chunks: dict[LatLon, dict[datetime, HourlySeries]] = defaultdict(dict)
    missing_by_range: dict[tuple[datetime, datetime], list[LatLon]] = defaultdict(list)
    for cell in cells:
        missing = []
        for day in days:
            chunk = cached.get(keys[(cell, day)])
            if chunk is None:
                missing.append(day)
            else:
                chunks[cell][day] = chunk
        if missing:
            # Fetch one contiguous range per cell (re-fetching a cached day in between is cheaper
            # than a second request).
            missing_by_range[(missing[0], missing[-1])].append(cell)

    jobs = [
        (cells_in_range[i : i + BATCH_SIZE], day_from, day_to)
        for (day_from, day_to), cells_in_range in missing_by_range.items()
        for i in range(0, len(cells_in_range), BATCH_SIZE)
    ]

    def run(job):
        batch, day_from, day_to = job
        fetch_end = min(day_to + DAY - HOUR, horizon)
        try:
            return job, _fetch_batch(batch, day_from, fetch_end, max_wait_s), None
        except (ProviderError, KeyError, ValueError, TypeError) as exc:
            logger.warning("Open-Meteo batch of %d cells failed: %s", len(batch), exc)
            return job, None, exc

    outcomes = []
    if jobs:
        with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(jobs))) as pool:
            outcomes = list(pool.map(run, jobs))

    fresh = {}
    errors = []
    for (batch, day_from, day_to), series_list, error in outcomes:
        if series_list is None:
            result.failed_cells += len(batch)
            errors.append(error)
            continue
        for cell, series in zip(batch, series_list, strict=True):
            day = day_from
            while day <= day_to:
                chunk = _slice(series, day, 24)
                if chunk is not None and len(chunk):
                    chunks[cell][day] = chunk
                    fresh[keys[(cell, day)]] = chunk
                day += DAY
    if fresh:
        cache.set_many(fresh, timeout=CACHE_TTL_S)

    for cell in cells:
        ordered = []
        for day in days:  # consecutive days only: a gap would break the hourly index
            if day not in chunks[cell]:
                break
            ordered.append(chunks[cell][day])
        if ordered:
            result.series[cell] = _concat(ordered)

    if not result.series and errors:
        if any(isinstance(e, WeatherBusy) for e in errors):
            raise WeatherBusy("all Open-Meteo batches were rate-limited")
        raise WeatherUnavailable("all Open-Meteo batches failed")
    return result

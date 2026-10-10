"""Open-Meteo hourly forecast client (no API key; CC-BY 4.0 attribution shown in the UI).

* Points are snapped to a 0.05° grid (~3.5 mi), finer than the underlying HRRR (3 km) / GFS (~13 km)
  models, so nearby checkpoints share one forecast and one cache entry.
* Up to BATCH_SIZE coordinates go in one request (comma-separated lat/lon lists).
* Cache keys contain the cell, the exact UTC hour window and the current hour (model refresh bucket),
  so a cached forecast is never served for a different time window or after it goes stale.
* Requests are clamped to the forecast horizon; hours beyond it stay missing and become "Unknown".
"""

import logging
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from django.core.cache import cache

from routing.geometry import LatLon
from weather.matching import HOUR, HourlySeries, floor_hour

from .errors import ProviderError, WeatherUnavailable
from .http import get_json

logger = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY_VARS = "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall"
CELL_DEG = 0.05
BATCH_SIZE = 50
MAX_WORKERS = 4
FORECAST_DAYS = 16
CACHE_TTL_S = 60 * 60


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


def _cache_key(cell: LatLon, start: datetime, end: datetime, now: datetime) -> str:
    return f"om:{cell[0]:.4f}:{cell[1]:.4f}:{start:%Y%m%d%H}:{end:%Y%m%d%H}:{now:%Y%m%d%H}"


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


def _fetch_batch(cells: list[LatLon], start: datetime, end: datetime) -> list[HourlySeries]:
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
    data = get_json(FORECAST_URL, params, error_cls=WeatherUnavailable)
    payloads = data if isinstance(data, list) else [data]
    if len(payloads) != len(cells):
        raise WeatherUnavailable(f"expected {len(cells)} locations, got {len(payloads)}")
    return [parse_location(p) for p in payloads]


def fetch_forecasts(
    points: Iterable[LatLon], start: datetime, end: datetime, now: datetime | None = None
) -> ForecastResult:
    """Hourly series for every snapped cell touched by `points`, covering [start, end] where available.

    Returns the series keyed by snapped cell. Raises WeatherUnavailable only if every batch failed.
    """
    now = floor_hour(now or datetime.now(UTC))
    start = max(floor_hour(start), now - timedelta(days=2))
    end = min(floor_hour(end), forecast_horizon(now))
    cells = sorted({snap(p) for p in points})
    result = ForecastResult()
    if not cells or start > end:
        return result  # nothing requested inside the forecast horizon

    keys = {cell: _cache_key(cell, start, end, now) for cell in cells}
    cached = cache.get_many(list(keys.values()))
    missing = []
    for cell in cells:
        if keys[cell] in cached:
            result.series[cell] = cached[keys[cell]]
        else:
            missing.append(cell)

    batches = [missing[i : i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]
    if not batches:
        return result

    def run(batch: list[LatLon]) -> tuple[list[LatLon], list[HourlySeries] | None]:
        try:
            return batch, _fetch_batch(batch, start, end)
        except (ProviderError, KeyError, ValueError, TypeError) as exc:
            logger.warning("Open-Meteo batch of %d cells failed: %s", len(batch), exc)
            return batch, None

    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(batches))) as pool:
        outcomes = list(pool.map(run, batches))

    fresh = {}
    for batch, series_list in outcomes:
        if series_list is None:
            result.failed_cells += len(batch)
            continue
        for cell, series in zip(batch, series_list, strict=True):
            result.series[cell] = series
            fresh[keys[cell]] = series
    if fresh:
        cache.set_many(fresh, timeout=CACHE_TTL_S)
    if result.failed_cells == len(missing) and not result.series:
        raise WeatherUnavailable("all Open-Meteo batches failed")
    return result

"""Shared HTTP access for providers: bounded timeouts, one retry on transient failures, no secret leakage."""

import logging
import time
from typing import Any

import httpx

from .errors import ProviderError, ProviderTimeout

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(connect=3.0, read=12.0, write=5.0, pool=5.0)
RETRY_STATUSES = {429, 500, 502, 503, 504}
_client = httpx.Client(timeout=TIMEOUT, headers={"User-Agent": "weather-aware-truck-routing/1.0"})


MAX_RETRY_AFTER_S = 3.0


def _retry_delay(response: httpx.Response, attempt: int, backoff_s: float) -> float:
    """Honour Retry-After on 429 (capped so a request never hangs), else linear backoff."""
    if response.status_code == 429:
        try:
            return min(float(response.headers.get("Retry-After", 2)), MAX_RETRY_AFTER_S)
        except ValueError:
            return 2.0
    return backoff_s * (attempt + 1)


def get_json(
    url: str,
    params: dict[str, Any],
    *,
    error_cls: type[ProviderError],
    busy_cls: type[ProviderError] | None = None,
    retries: int = 1,
    backoff_s: float = 0.4,
) -> Any:
    """GET a JSON document. Raises `error_cls` (`busy_cls` on a persistent 429, or ProviderTimeout).

    The API key is stripped from anything logged.
    """
    safe_params = {k: v for k, v in params.items() if k.lower() != "apikey"}
    for attempt in range(retries + 1):
        try:
            response = _client.get(url, params=params)
        except httpx.TimeoutException as exc:
            if attempt < retries:
                time.sleep(backoff_s * (attempt + 1))
                continue
            logger.warning("Timeout calling %s %s", url, safe_params)
            raise ProviderTimeout(f"timeout calling {url}") from exc
        except httpx.HTTPError as exc:
            if attempt < retries:
                time.sleep(backoff_s * (attempt + 1))
                continue
            logger.warning("HTTP error calling %s: %s", url, type(exc).__name__)
            raise error_cls(f"{type(exc).__name__} calling {url}") from exc

        if response.status_code in RETRY_STATUSES and attempt < retries:
            time.sleep(_retry_delay(response, attempt, backoff_s))
            continue
        if response.status_code == 429:
            logger.warning("%s rate-limited the request (429)", url)
            raise (busy_cls or error_cls)(f"{url} returned 429")
        if response.status_code >= 400:
            logger.warning("%s returned %s: %s", url, response.status_code, response.text[:300])
            raise error_cls(f"{url} returned {response.status_code}")
        try:
            return response.json()
        except ValueError as exc:
            raise error_cls(f"invalid JSON from {url}") from exc
    raise error_cls(f"exhausted retries for {url}")  # pragma: no cover - loop always returns or raises

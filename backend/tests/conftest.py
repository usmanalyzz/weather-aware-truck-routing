import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _no_retry_sleep(monkeypatch):
    monkeypatch.setattr("providers.http.time.sleep", lambda _s: None)


@pytest.fixture(autouse=True)
def _fresh_weather_budget(monkeypatch):
    """Each test gets its own unlimited Open-Meteo budget (budget behaviour is tested separately)."""
    from providers import openmeteo
    from providers.ratelimit import LocationBudget

    monkeypatch.setattr(openmeteo, "budget", LocationBudget(per_minute=10**9, max_wait_s=0))

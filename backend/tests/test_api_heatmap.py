import gzip
import json
from datetime import UTC, datetime, timedelta

import httpx
import respx

from providers import here, openmeteo
from routing.geometry import haversine_miles
from tests.factories import calm, here_routes, openmeteo_handler
from tests.test_api_plan import DIRECT, NORTH, SOUTH, STORM_CENTER, body, departure


def storm_after_hour_10(lat, lon, t):
    """A storm on the direct route that only arrives 10 h after departure."""
    if t >= departure() + timedelta(hours=10) and haversine_miles((lat, lon), STORM_CENTER) < 60:
        return {"wind": 47.0, "gust": 60.0, "rain": 0.6, "showers": 0.0, "snow": 0.0}
    return calm(lat, lon, t)


def mock(weather=storm_after_hour_10, calls=None):
    here_route = respx.get(here.ROUTES_URL).mock(
        return_value=httpx.Response(
            200, json=here_routes((DIRECT, 15 * 3600), (NORTH, 16 * 3600), (SOUTH, 17 * 3600))
        )
    )
    respx.get(openmeteo.FORECAST_URL).mock(side_effect=openmeteo_handler(weather, calls))
    return here_route


def post(client, path, **overrides):
    return client.post(path, body(**overrides), content_type="application/json")


@respx.mock
def test_heatmap_returns_hourly_grid_aligned_to_departure(client):
    mock()

    response = post(client, "/api/trips/heatmap")

    assert response.status_code == 200
    data = response.json()
    assert data["hours"] == 49
    assert datetime.fromisoformat(data["start"].replace("Z", "+00:00")) == departure()
    n = data["grid"]["count"]
    assert 50 < n <= 600
    assert len(data["points"]) == n
    for metric in ("risk", "wind_mph", "rain_in_hr", "snow_in_hr"):
        assert len(data["values"][metric]) == n
        assert all(len(row) == 49 for row in data["values"][metric])
    assert all(data["available_hours"])
    assert data["scales"]["wind_mph"]["values"] == [25, 35, 45, 55]
    assert data["notices"] == []


@respx.mock
def test_heatmap_risk_changes_over_time_and_uses_rules(client):
    mock()

    data = post(client, "/api/trips/heatmap").json()

    storm_idx = min(
        range(len(data["points"])),
        key=lambda i: haversine_miles((data["points"][i][1], data["points"][i][0]), STORM_CENTER),
    )
    risk = data["values"]["risk"][storm_idx]
    assert risk[0] == 0 and risk[9] == 0  # calm before the storm arrives
    assert risk[10] == 3  # 47 mph wind / 0.6 in rain -> Severe (20,000 lb load)
    assert data["values"]["wind_mph"][storm_idx][10] == 47.0
    assert data["values"]["rain_in_hr"][storm_idx][10] == 0.6


@respx.mock
def test_heatmap_applies_load_rules(client):
    mock()

    data = post(client, "/api/trips/heatmap", load_weight_lb=42_000).json()

    assert 4 in {v for row in data["values"]["risk"] for v in row}  # 47 mph + >30,000 lb -> No Travel


@respx.mock
def test_heatmap_reuses_the_cached_plan(client):
    here_route = mock()

    post(client, "/api/trips/plan")
    post(client, "/api/trips/heatmap")
    post(client, "/api/trips/heatmap")

    assert here_route.call_count == 1


@respx.mock
def test_missing_hours_are_null_and_reported(client):
    cutoff = departure() + timedelta(hours=30)

    def short_horizon(lat, lon, t):
        if t > cutoff:
            return {"wind": None, "gust": None, "rain": None, "showers": None, "snow": None}
        return calm(lat, lon, t)

    mock(weather=short_horizon)

    data = post(client, "/api/trips/heatmap").json()

    assert data["available_hours"][30] is True
    assert data["available_hours"][31] is False
    assert data["values"]["risk"][0][31] is None
    assert data["values"]["wind_mph"][0][31] is None
    assert any("ends 31 h after departure" in n for n in data["notices"])


@respx.mock
def test_payload_is_compact_when_gzipped(client):
    mock()

    response = client.post(
        "/api/trips/heatmap", body(), content_type="application/json", HTTP_ACCEPT_ENCODING="gzip"
    )

    assert response["Content-Encoding"] == "gzip"
    raw = gzip.decompress(response.content)
    assert len(response.content) < 300_000
    assert json.loads(raw)["hours"] == 49


def test_heatmap_validates_like_plan(client):
    response = post(
        client, "/api/trips/heatmap", departure_time=(datetime.now(UTC) - timedelta(days=1)).isoformat()
    )

    assert response.status_code == 400
    assert "departure_time" in response.json()["error"]["fields"]


@respx.mock
def test_incomplete_heatmap_is_not_cached_so_retry_fills_it(client, monkeypatch):
    from providers import openmeteo as om
    from providers.ratelimit import LocationBudget

    mock()
    post(client, "/api/trips/plan")
    # No budget left this minute: grid batches are skipped.
    monkeypatch.setattr(om, "budget", LocationBudget(per_minute=1, max_wait_s=0))
    om.budget.acquire(1)
    first = post(client, "/api/trips/heatmap")
    assert first.status_code == 503 or first.json()["complete"] is False

    # Budget available again: the retry is recomputed, not served from cache.
    monkeypatch.setattr(om, "budget", LocationBudget(per_minute=10**9, max_wait_s=0))
    second = post(client, "/api/trips/heatmap").json()
    assert second["complete"] is True
    assert second["notices"] == []

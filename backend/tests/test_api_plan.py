from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
from rest_framework import exceptions

from providers import here, openmeteo
from routing.geometry import haversine_miles
from tests.factories import calm, dogleg, here_routes, line, openmeteo_handler
from trips.exceptions import api_exception_handler

CHI, DEN = (41.88, -87.63), (39.74, -104.99)
STORM_CENTER = (40.8, -96.3)  # sits on the direct Chicago -> Denver line

DIRECT = line(CHI, DEN, 300)
NORTH = dogleg(CHI, DEN, via=(43.0, -96.0), steps=150)
SOUTH = dogleg(CHI, DEN, via=(38.5, -95.0), steps=150)


def departure() -> datetime:
    return (datetime.now(UTC) + timedelta(days=1)).replace(minute=0, second=0, microsecond=0)


def body(**overrides) -> dict:
    data = {
        "origin": {"lat": CHI[0], "lon": CHI[1], "label": "Chicago, IL"},
        "destination": {"lat": DEN[0], "lon": DEN[1], "label": "Denver, CO"},
        "departure_time": departure().isoformat(),
        "load_weight_lb": 20_000,
        "sample_interval_mi": 25,
    }
    data.update(overrides)
    return data


def storm(lat, lon, _t):
    if haversine_miles((lat, lon), STORM_CENTER) < 60:
        return {"wind": 47.0, "gust": 62.0, "rain": 0.2, "showers": 0.0, "snow": 0.0}
    return calm(lat, lon, _t)


def mock_providers(routes=((DIRECT, 15 * 3600), (NORTH, 16 * 3600), (SOUTH, 17 * 3600)), weather=storm):
    here_route = respx.get(here.ROUTES_URL).mock(return_value=httpx.Response(200, json=here_routes(*routes)))
    respx.get(openmeteo.FORECAST_URL).mock(side_effect=openmeteo_handler(weather))
    return here_route


@pytest.fixture
def api(client):
    def post(**overrides):
        return client.post("/api/trips/plan", body(**overrides), content_type="application/json")

    return post


# --- happy path ------------------------------------------------------------------------------


@respx.mock
def test_plan_returns_three_routes_with_checkpoints_and_recommendation(api):
    mock_providers()

    response = api()

    assert response.status_code == 200
    data = response.json()
    assert [r["label"] for r in data["routes"]] == ["Route A", "Route B", "Route C"]

    direct = data["routes"][0]
    cps = direct["checkpoints"]
    assert cps[0]["mile"] == 0 and cps[0]["eta"] == data["request"]["departure_time"]
    assert cps[1]["mile"] == 25
    assert cps[-1]["mile"] == pytest.approx(direct["distance_mi"], abs=0.1)
    assert cps[-1]["eta"] == direct["arrival_time"]
    assert direct["geometry"]["type"] == "LineString"
    assert len(direct["geometry"]["coordinates"]) < len(DIRECT)  # simplified for display

    # The storm sits on the direct route: Severe (47 mph, 20,000 lb load is under the override).
    assert direct["summary"]["severe_miles"] > 0
    assert {cp["risk"]["level"] for cp in cps} == {"LOW", "SEVERE"}
    stormy = next(cp for cp in cps if cp["risk"]["level"] == "SEVERE")
    assert stormy["risk"]["factors"] == {"wind": "SEVERE", "rain": "MODERATE"}
    assert stormy["weather"]["status"] == "ok"
    assert stormy["weather"]["wind_mph"] == 47.0

    rec = data["recommendation"]
    assert rec["route_id"] == "r2"  # clean, and faster than the other clean route
    assert rec["ranking"] == ["r2", "r3", "r1"]
    assert rec["all_routes_unsafe"] is False
    assert "fewer Severe-or-worse miles" in " ".join(rec["rationale"])
    assert "shorter travel time" in " ".join(rec["rationale"])
    assert data["notices"] == []
    assert data["forecast_window"]["hours"] == 48


@respx.mock
def test_heavy_load_turns_severe_wind_into_no_travel(api):
    mock_providers()

    data = api(load_weight_lb=42_000).json()

    direct = data["routes"][0]["summary"]
    assert direct["no_travel_miles"] > 0
    assert direct["unsafe"] is True
    assert direct["max_level"] == "NO_TRAVEL"
    assert data["recommendation"]["route_id"] == "r2"


@respx.mock
def test_all_routes_unsafe_is_flagged(api):
    mock_providers(weather=lambda *_: {"wind": 56.0, "gust": 70.0, "rain": 0, "showers": 0, "snow": 0})

    rec = api().json()["recommendation"]

    assert rec["all_routes_unsafe"] is True
    assert rec["rationale"][0].startswith("No route is confirmed safe")


@respx.mock
def test_gross_weight_sent_to_here_includes_tare(api, settings):
    settings.TRUCK_TARE_WEIGHT_LB = 35_000
    route = mock_providers()

    api(load_weight_lb=40_000)

    assert route.calls.last.request.url.params["vehicle[grossWeight]"] == "34019"  # 75,000 lb in kg


@pytest.mark.parametrize(("interval", "second_mile"), [(10, 10), (50, 50)])
@respx.mock
def test_sampling_interval_is_respected(api, interval, second_mile):
    mock_providers()

    cps = api(sample_interval_mi=interval).json()["routes"][1]["checkpoints"]

    assert cps[1]["mile"] == second_mile
    assert all(b["mile"] - a["mile"] <= interval + 1e-6 for a, b in zip(cps, cps[1:], strict=False))


# --- fewer routes, duplicates, partial data -------------------------------------------------------


@respx.mock
def test_duplicate_alternatives_are_removed_and_reported(api):
    dup = [(lat + 0.001, lon) for lat, lon in DIRECT]
    mock_providers(routes=((DIRECT, 15 * 3600), (dup, 15 * 3600), (NORTH, 16 * 3600)))

    data = api().json()

    assert [r["id"] for r in data["routes"]] == ["r1", "r2"]
    assert data["notices"] == ["The routing provider returned 2 distinct truck routes for this trip."]


@respx.mock
def test_single_route(api):
    mock_providers(routes=((NORTH, 16 * 3600),))

    data = api().json()

    assert len(data["routes"]) == 1
    assert "1 distinct truck route " in data["notices"][0]
    assert any("only route" in line for line in data["recommendation"]["rationale"])


@respx.mock
def test_missing_forecast_hours_become_unknown(api):
    cutoff = departure() + timedelta(hours=6)

    def partial(lat, lon, t):
        if t > cutoff:
            return {"wind": None, "gust": None, "rain": None, "showers": None, "snow": None}
        return calm(lat, lon, t)

    mock_providers(weather=partial)

    data = api().json()

    route = data["routes"][1]
    unknown = [cp for cp in route["checkpoints"] if cp["risk"]["level"] == "UNKNOWN"]
    assert unknown and unknown[0]["weather"] == {"status": "unavailable"}
    assert route["summary"]["unknown_miles"] > 0
    assert route["summary"]["avg_risk"] == 0
    assert any("outside the available forecast" in n for n in data["notices"])


@respx.mock
def test_identical_requests_are_served_from_cache(api):
    route = mock_providers()

    api()
    api()

    assert route.call_count == 1


# --- errors ----------------------------------------------------------------------------------------


@respx.mock
def test_routing_timeout_returns_504_envelope(api):
    respx.get(here.ROUTES_URL).mock(side_effect=httpx.ReadTimeout("slow"))

    response = api()

    assert response.status_code == 504
    assert response.json()["error"]["code"] == "UPSTREAM_TIMEOUT"
    assert "here" not in response.json()["error"]["message"].lower()


@respx.mock
def test_no_route_returns_422(api):
    respx.get(here.ROUTES_URL).mock(return_value=httpx.Response(200, json={"routes": []}))

    response = api()

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_ROUTE"


@respx.mock
def test_weather_outage_returns_502(api):
    respx.get(here.ROUTES_URL).mock(return_value=httpx.Response(200, json=here_routes((NORTH, 3600))))
    respx.get(openmeteo.FORECAST_URL).mock(return_value=httpx.Response(503))

    response = api()

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "WEATHER_UNAVAILABLE"


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"load_weight_lb": -1}, "load_weight_lb"),
        ({"load_weight_lb": 80_001}, "load_weight_lb"),
        ({"sample_interval_mi": 30}, "sample_interval_mi"),
        ({"departure_time": "2020-01-01T00:00:00Z"}, "departure_time"),
        ({"departure_time": (datetime.now(UTC) + timedelta(days=14)).isoformat()}, "departure_time"),
        ({"departure_time": "tomorrow"}, "departure_time"),
        ({"destination": {"lat": CHI[0], "lon": CHI[1]}}, "destination"),
        ({"origin": {"lat": 95, "lon": 0}}, "origin"),
    ],
)
def test_validation_errors(api, overrides, field):
    response = api(**overrides)

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "VALIDATION"
    assert field in error["fields"]


def test_unexpected_error_is_hidden(api, monkeypatch):
    def boom(_req):
        raise RuntimeError("secret internals")

    monkeypatch.setattr("trips.views.plan_trip_cached", boom)

    response = api()

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again."}
    }


def test_throttled_and_other_api_errors_use_envelope():
    throttled = api_exception_handler(exceptions.Throttled(wait=10), {})
    not_found = api_exception_handler(exceptions.NotFound(), {})

    assert throttled.data["error"]["code"] == "RATE_LIMITED"
    assert not_found.data["error"]["code"] == "NOT_FOUND"


def test_method_not_allowed(client):
    assert client.get("/api/trips/plan").json()["error"]["code"] == "METHOD_NOT_ALLOWED"


# --- geocoding ---------------------------------------------------------------------------------


@respx.mock
def test_geocode_suggest(client):
    respx.get(here.AUTOSUGGEST_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "items": [
                    {
                        "title": "Denver",
                        "address": {"label": "Denver, CO, United States"},
                        "position": {"lat": 39.74, "lng": -104.99},
                    }
                ]
            },
        )
    )

    response = client.get("/api/geocode/suggest", {"q": "denv"})

    assert response.status_code == 200
    assert response.json() == {
        "results": [{"label": "Denver, CO, United States", "lat": 39.74, "lon": -104.99}]
    }


def test_geocode_suggest_requires_query(client):
    response = client.get("/api/geocode/suggest", {"q": "de"})

    assert response.status_code == 400
    assert "q" in response.json()["error"]["fields"]


@respx.mock
def test_partial_weather_outage_adds_notice(api):
    good = openmeteo_handler(calm)

    def flaky(request):
        # The batch holding the southern-most cells always fails (also on retry); the others succeed.
        first_lat = float(request.url.params["latitude"].split(",")[0])
        return httpx.Response(500) if first_lat < 40.0 else good(request)

    respx.get(here.ROUTES_URL).mock(
        return_value=httpx.Response(200, json=here_routes((DIRECT, 15 * 3600), (NORTH, 16 * 3600)))
    )
    respx.get(openmeteo.FORECAST_URL).mock(side_effect=flaky)

    data = api(sample_interval_mi=10).json()

    assert any("Some forecast data could not be loaded" in n for n in data["notices"])
    levels = {cp["risk"]["level"] for r in data["routes"] for cp in r["checkpoints"]}
    assert levels == {"LOW", "UNKNOWN"}

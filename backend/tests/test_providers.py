from datetime import UTC, datetime, timedelta

import flexpolyline
import httpx
import pytest
import respx

from providers import here, openmeteo
from providers.errors import (
    GeocodingUnavailable,
    NoRouteFound,
    ProviderTimeout,
    RoutingUnavailable,
    WeatherBusy,
    WeatherUnavailable,
)
from providers.ratelimit import BudgetExceeded, LocationBudget
from tests.factories import here_routes, here_section, line, openmeteo_handler

NOW = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
DEP = datetime(2026, 10, 11, 6, 0, tzinfo=UTC)


# --- HERE routing -----------------------------------------------------------------------------


@respx.mock
def test_fetch_truck_routes_sends_truck_params_and_parses():
    coords = line((41.0, -90.0), (42.0, -90.0))
    route = respx.get(here.ROUTES_URL).mock(
        return_value=httpx.Response(200, json=here_routes((coords, 3600)))
    )

    routes = here.fetch_truck_routes((41.0, -90.0), (42.0, -90.0), DEP, gross_weight_kg=34_927)

    params = route.calls.last.request.url.params
    assert params["transportMode"] == "truck"
    assert params["vehicle[grossWeight]"] == "34927"
    assert params["alternatives"] == "5"
    assert params["spans"] == "duration,length,dynamicSpeedInfo"
    assert params["departureTime"] == "2026-10-11T06:00:00+00:00"
    assert len(routes) == 1
    assert routes[0].coords == coords
    assert routes[0].duration_s == 3600
    assert [s.offset for s in routes[0].spans] == [0, 30]


def test_parse_route_joins_sections_and_rebases_span_offsets():
    a = line((41.0, -90.0), (41.5, -90.0), steps=10)
    b = line((41.5, -90.0), (42.0, -90.0), steps=10)  # shares the junction vertex
    raw = {"sections": [here_section(a, 600), here_section(b, 900, notices=[{"title": "Ferry"}])]}

    route = here.parse_route(raw)

    assert len(route.coords) == 21
    assert [s.offset for s in route.spans] == [0, 5, 10, 15]
    assert route.duration_s == 1500
    assert route.notices == ["Ferry"]


def test_parse_route_without_shared_junction_and_missing_spans():
    a = line((41.0, -90.0), (41.5, -90.0), steps=4)
    b = line((41.6, -90.0), (42.0, -90.0), steps=4)
    sec_b = here_section(b, 300)
    sec_b.pop("spans")
    sec_a = here_section(a, 300)
    sec_a["spans"] = [{"offset": 2, "duration": 300}]

    route = here.parse_route({"sections": [sec_a, sec_b]})

    assert len(route.coords) == 10
    assert [(s.offset, s.duration_s) for s in route.spans] == [(0, 0), (2, 300), (5, 300)]


def test_parse_route_rejects_missing_geometry():
    with pytest.raises(RoutingUnavailable):
        here.parse_route({"sections": [{"polyline": flexpolyline.encode([(1.0, 1.0)]), "summary": {}}]})


@respx.mock
def test_no_routes_raises_no_route_found():
    respx.get(here.ROUTES_URL).mock(
        return_value=httpx.Response(
            200, json={"routes": [], "notices": [{"title": "Couldn't find a route."}]}
        )
    )

    with pytest.raises(NoRouteFound) as err:
        here.fetch_truck_routes((41, -90), (42, -90), DEP, 30_000)
    assert err.value.status == 422


@respx.mock
def test_server_error_is_retried_once_then_fails():
    route = respx.get(here.ROUTES_URL).mock(return_value=httpx.Response(503))

    with pytest.raises(RoutingUnavailable):
        here.fetch_truck_routes((41, -90), (42, -90), DEP, 30_000)
    assert route.call_count == 2


@respx.mock
def test_transient_error_recovers_on_retry():
    coords = line((41.0, -90.0), (42.0, -90.0))
    respx.get(here.ROUTES_URL).mock(
        side_effect=[httpx.Response(502), httpx.Response(200, json=here_routes((coords, 3600)))]
    )

    assert len(here.fetch_truck_routes((41, -90), (42, -90), DEP, 30_000)) == 1


@respx.mock
def test_timeout_raises_provider_timeout():
    respx.get(here.ROUTES_URL).mock(side_effect=httpx.ReadTimeout("slow"))

    with pytest.raises(ProviderTimeout):
        here.fetch_truck_routes((41, -90), (42, -90), DEP, 30_000)


@respx.mock
def test_client_error_and_invalid_json_are_not_retried():
    route = respx.get(here.ROUTES_URL).mock(return_value=httpx.Response(401, json={"error": "Unauthorized"}))
    with pytest.raises(RoutingUnavailable):
        here.fetch_truck_routes((41, -90), (42, -90), DEP, 30_000)
    assert route.call_count == 1

    respx.get(here.ROUTES_URL).mock(return_value=httpx.Response(200, text="<html>"))
    with pytest.raises(RoutingUnavailable):
        here.fetch_truck_routes((41, -90), (42, -90), DEP, 30_000)


@respx.mock
def test_connection_error_raises_provider_error():
    respx.get(here.ROUTES_URL).mock(side_effect=httpx.ConnectError("down"))

    with pytest.raises(RoutingUnavailable):
        here.fetch_truck_routes((41, -90), (42, -90), DEP, 30_000)


def test_missing_api_key(settings):
    settings.HERE_API_KEY = ""

    with pytest.raises(RoutingUnavailable):
        here.fetch_truck_routes((41, -90), (42, -90), DEP, 30_000)
    with pytest.raises(GeocodingUnavailable):
        here.autosuggest("chicago")


@respx.mock
def test_autosuggest_keeps_only_items_with_coordinates():
    route = respx.get(here.AUTOSUGGEST_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "items": [
                    {
                        "title": "Chicago",
                        "address": {"label": "Chicago, IL, United States"},
                        "position": {"lat": 41.88, "lng": -87.63},
                    },
                    {"title": "Chicken restaurants", "resultType": "categoryQuery"},
                ]
            },
        )
    )

    places = here.autosuggest("chic")

    assert places == [here.Place(label="Chicago, IL, United States", lat=41.88, lon=-87.63)]
    params = route.calls.last.request.url.params
    assert params["at"] == here.US_CENTER  # HERE rejects autosuggest without a search position
    assert params["in"] == "countryCode:USA,CAN"


# --- Open-Meteo ------------------------------------------------------------------------------


def test_snap_to_grid():
    assert openmeteo.snap((41.8781, -87.6298)) == (41.9, -87.65)
    assert openmeteo.snap((39.7392, -104.9903)) == (39.75, -105.0)


def test_forecast_horizon():
    assert openmeteo.forecast_horizon(NOW) == datetime(2026, 10, 25, 23, tzinfo=UTC)


@respx.mock
def test_fetch_forecasts_parses_units_and_sums_rain_and_showers():
    def wet(_lat, _lon, _t):
        return {"wind": 30.0, "gust": 41.0, "rain": 0.08, "showers": 0.04, "snow": 0.0}

    respx.get(openmeteo.FORECAST_URL).mock(side_effect=openmeteo_handler(wet))

    result = openmeteo.fetch_forecasts([(41.0, -90.0), (41.01, -90.01)], DEP, DEP + timedelta(hours=3), NOW)

    assert list(result.series) == [(41.0, -90.0)]  # both points snap to one cell
    series = result.series[(41.0, -90.0)]
    day = DEP.replace(hour=0)
    assert series.start == day  # whole UTC days are fetched and cached
    assert len(series) == 24
    assert series.index_of(DEP) == DEP.hour
    assert series.rain_in[DEP.hour] == pytest.approx(0.12)
    assert series.wind_mph[DEP.hour] == 30.0


@respx.mock
def test_fetch_forecasts_batches_and_caches():
    calls = []
    respx.get(openmeteo.FORECAST_URL).mock(side_effect=openmeteo_handler(calls=calls))
    points = [(40.0 + i * 0.1, -90.0) for i in range(120)]

    first = openmeteo.fetch_forecasts(points, DEP, DEP + timedelta(hours=2), NOW)
    second = openmeteo.fetch_forecasts(points, DEP, DEP + timedelta(hours=2), NOW)

    assert len(calls) == 3  # 50 + 50 + 20 cells, then fully served from cache
    assert calls[0]["wind_speed_unit"] == "mph"
    assert calls[0]["precipitation_unit"] == "inch"
    assert len(first.series) == len(second.series) == 120


@respx.mock
def test_cache_is_shared_across_trips_on_the_same_days_and_refreshed_hourly():
    calls = []
    respx.get(openmeteo.FORECAST_URL).mock(side_effect=openmeteo_handler(calls=calls))
    cell = [(41.0, -90.0)]

    openmeteo.fetch_forecasts(cell, DEP, DEP + timedelta(hours=2), NOW)
    # A different trip window on the same UTC day: served from cache.
    later = openmeteo.fetch_forecasts(cell, DEP + timedelta(hours=5), DEP + timedelta(hours=9), NOW)
    assert len(calls) == 1
    assert later.series[(41.0, -90.0)].index_of(DEP + timedelta(hours=9)) is not None

    # A window reaching into the next day fetches only that day.
    openmeteo.fetch_forecasts(cell, DEP, DEP + timedelta(days=1), NOW)
    assert len(calls) == 2
    next_day = (DEP + timedelta(days=1)).replace(hour=0)
    assert calls[1]["start_hour"] == next_day.strftime("%Y-%m-%dT%H:%M")

    # A newer model hour never reuses older forecasts.
    openmeteo.fetch_forecasts(cell, DEP, DEP + timedelta(hours=2), NOW + timedelta(hours=1))
    assert len(calls) == 3


@respx.mock
def test_window_is_clamped_to_forecast_horizon():
    calls = []
    respx.get(openmeteo.FORECAST_URL).mock(side_effect=openmeteo_handler(calls=calls))
    horizon = openmeteo.forecast_horizon(NOW)

    result = openmeteo.fetch_forecasts(
        [(41.0, -90.0)], horizon - timedelta(hours=2), horizon + timedelta(days=2), NOW
    )

    assert calls[0]["end_hour"] == horizon.strftime("%Y-%m-%dT%H:%M")
    series = result.series[(41.0, -90.0)]
    assert series.end() == horizon  # nothing past the horizon is ever fetched or invented


@respx.mock
def test_rate_limit_from_provider_becomes_weather_busy():
    route = respx.get(openmeteo.FORECAST_URL).mock(
        return_value=httpx.Response(
            429, headers={"Retry-After": "1"}, json={"error": True, "reason": "limit"}
        )
    )

    with pytest.raises(WeatherBusy) as err:
        openmeteo.fetch_forecasts([(41.0, -90.0)], DEP, DEP + timedelta(hours=1), NOW)
    assert route.call_count == 2  # retried once after Retry-After
    assert err.value.status == 503


def test_own_budget_exhaustion_becomes_weather_busy(monkeypatch):
    budget = LocationBudget(per_minute=10, max_wait_s=0)
    budget.acquire(10)  # other trips already used this minute's allowance
    monkeypatch.setattr(openmeteo, "budget", budget)
    points = [(40.0 + i * 0.1, -90.0) for i in range(5)]

    with pytest.raises(WeatherBusy):
        openmeteo.fetch_forecasts(points, DEP, DEP + timedelta(hours=1), NOW)


def test_window_entirely_beyond_horizon_makes_no_request():
    late = openmeteo.forecast_horizon(NOW) + timedelta(hours=5)

    result = openmeteo.fetch_forecasts([(41.0, -90.0)], late, late + timedelta(hours=3), NOW)

    assert result.series == {}
    assert result.failed_cells == 0


@respx.mock
def test_partial_batch_failure_is_reported_not_raised():
    good = openmeteo_handler()
    responses = iter([good, lambda _req: httpx.Response(400, json={"error": True, "reason": "bad"})])
    respx.get(openmeteo.FORECAST_URL).mock(side_effect=lambda req: next(responses)(req))
    points = [(40.0 + i * 0.1, -90.0) for i in range(60)]

    result = openmeteo.fetch_forecasts(points, DEP, DEP + timedelta(hours=1), NOW)

    assert len(result.series) + result.failed_cells == 60
    assert result.failed_cells in (10, 50)


@respx.mock
def test_all_batches_failing_raises():
    respx.get(openmeteo.FORECAST_URL).mock(return_value=httpx.Response(500))

    with pytest.raises(WeatherUnavailable):
        openmeteo.fetch_forecasts([(41.0, -90.0)], DEP, DEP + timedelta(hours=1), NOW)


@respx.mock
def test_location_count_mismatch_counts_as_failure():
    one_location = {
        "hourly": {
            "time": ["2026-10-11T06:00"],
            "wind_speed_10m": [1],
            "wind_gusts_10m": [1],
            "rain": [0],
            "showers": [0],
            "snowfall": [0],
        }
    }
    respx.get(openmeteo.FORECAST_URL).mock(return_value=httpx.Response(200, json=one_location))

    with pytest.raises(WeatherUnavailable):  # asked for 2 locations, got 1
        openmeteo.fetch_forecasts([(41.0, -90.0), (41.1, -90.0)], DEP, DEP + timedelta(hours=1), NOW)


def test_parse_location_handles_null_values():
    series = openmeteo.parse_location(
        {
            "hourly": {
                "time": ["2026-10-11T06:00"],
                "wind_speed_10m": [None],
                "wind_gusts_10m": [None],
                "rain": [0.1],
                "showers": [None],
                "snowfall": [None],
            }
        }
    )

    assert series.rain_in == [None]
    assert series.wind_mph == [None]


# --- rate budget -------------------------------------------------------------------------------


class FakeClock:
    def __init__(self):
        self.now = 0.0
        self.slept = []

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


def test_budget_allows_up_to_limit_within_a_minute():
    clock = FakeClock()
    budget = LocationBudget(per_minute=100, max_wait_s=0, clock=clock, sleep=clock.sleep)

    budget.acquire(60)
    budget.acquire(40)
    assert budget.used() == 100
    with pytest.raises(BudgetExceeded):
        budget.acquire(1)


def test_budget_waits_for_the_window_to_free_up():
    clock = FakeClock()
    budget = LocationBudget(per_minute=100, max_wait_s=30, clock=clock, sleep=clock.sleep)

    budget.acquire(80)  # t=0
    clock.now = 40
    budget.acquire(20)  # t=40, window full
    budget.acquire(50)  # must wait until the t=0 entry expires at t=60

    assert clock.slept == [pytest.approx(20)]
    assert budget.used() == 70


def test_budget_fails_fast_when_the_wait_is_too_long():
    clock = FakeClock()
    budget = LocationBudget(per_minute=100, max_wait_s=5, clock=clock, sleep=clock.sleep)

    budget.acquire(100)
    with pytest.raises(BudgetExceeded):
        budget.acquire(10)  # would need ~60 s
    assert clock.slept == []


def test_oversized_batch_uses_the_whole_window():
    clock = FakeClock()
    budget = LocationBudget(per_minute=100, max_wait_s=0, clock=clock, sleep=clock.sleep)

    budget.acquire(250)
    assert budget.used() == 100


def test_per_call_wait_override():
    clock = FakeClock()
    budget = LocationBudget(per_minute=100, max_wait_s=1, clock=clock, sleep=clock.sleep)
    budget.acquire(100)

    budget.acquire(10, max_wait_s=90)  # e.g. the background heatmap: waits for the window instead of failing

    assert clock.slept == [pytest.approx(60)]

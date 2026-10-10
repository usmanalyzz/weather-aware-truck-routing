class ProviderError(Exception):
    """A third-party service failed. `code` is safe to show to clients; details are only logged."""

    code = "PROVIDER_ERROR"
    status = 502
    public_message = "An upstream service failed. Please try again."

    def __init__(self, detail: str = "", *, public_message: str | None = None):
        super().__init__(detail or self.public_message)
        if public_message:
            self.public_message = public_message


class ProviderTimeout(ProviderError):
    code = "UPSTREAM_TIMEOUT"
    status = 504
    public_message = "An upstream service took too long to respond. Please try again."


class RoutingUnavailable(ProviderError):
    code = "ROUTING_UNAVAILABLE"
    public_message = "The routing service is unavailable. Please try again shortly."


class NoRouteFound(ProviderError):
    code = "NO_ROUTE"
    status = 422
    public_message = "No truck route was found between these locations."


class WeatherUnavailable(ProviderError):
    code = "WEATHER_UNAVAILABLE"
    public_message = "The weather service is unavailable. Please try again shortly."


class GeocodingUnavailable(ProviderError):
    code = "GEOCODING_UNAVAILABLE"
    public_message = "Address search is unavailable. Please try again shortly."


class WeatherBusy(WeatherUnavailable):
    """Open-Meteo's free-tier rate limit was reached (or our own budget for it)."""

    code = "WEATHER_BUSY"
    status = 503
    public_message = "The weather service is busy right now. Please try again in a minute."

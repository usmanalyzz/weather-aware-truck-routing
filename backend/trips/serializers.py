from datetime import UTC, datetime, timedelta

from rest_framework import serializers

from routing.checkpoints import ALLOWED_INTERVALS_MI
from routing.geometry import haversine_miles

from .services.plan_trip import Location, TripRequest

MAX_LOAD_LB = 80_000
# Departure + 48 h heatmap + a multi-day trip must stay inside the ~16-day forecast horizon.
MAX_DAYS_AHEAD = 13
PAST_GRACE = timedelta(hours=1)


class LocationSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    label = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class TripPlanRequestSerializer(serializers.Serializer):
    origin = LocationSerializer()
    destination = LocationSerializer()
    departure_time = serializers.DateTimeField()
    load_weight_lb = serializers.IntegerField(min_value=0, max_value=MAX_LOAD_LB)
    sample_interval_mi = serializers.ChoiceField(choices=ALLOWED_INTERVALS_MI, default=25)

    def validate_departure_time(self, value: datetime) -> datetime:
        now = datetime.now(UTC)
        if value < now - PAST_GRACE:
            raise serializers.ValidationError("Departure must be now or in the future (forecasts only).")
        if value > now + timedelta(days=MAX_DAYS_AHEAD):
            raise serializers.ValidationError(
                f"Departure must be within {MAX_DAYS_AHEAD} days; forecasts beyond that are unavailable."
            )
        return value

    def validate(self, attrs):
        o, d = attrs["origin"], attrs["destination"]
        if haversine_miles((o["lat"], o["lon"]), (d["lat"], d["lon"])) < 1:
            raise serializers.ValidationError({"destination": "Destination must differ from the origin."})
        return attrs

    def to_trip_request(self) -> TripRequest:
        data = self.validated_data
        return TripRequest(
            origin=Location(**data["origin"]),
            destination=Location(**data["destination"]),
            departure=data["departure_time"],
            load_weight_lb=data["load_weight_lb"],
            sample_interval_mi=int(data["sample_interval_mi"]),
        )


class SuggestQuerySerializer(serializers.Serializer):
    q = serializers.CharField(min_length=3, max_length=120, trim_whitespace=True)

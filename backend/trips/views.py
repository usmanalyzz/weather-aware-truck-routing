from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from providers import here

from .serializers import SuggestQuerySerializer, TripPlanRequestSerializer
from .services.heatmap import heatmap_cached
from .services.plan_trip import plan_trip_cached


@api_view(["GET"])
@throttle_classes([])
def health(request: Request) -> Response:
    return Response({"status": "ok"})


class TripPlanView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "plan"

    def post(self, request: Request) -> Response:
        serializer = TripPlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(plan_trip_cached(serializer.to_trip_request()))


class TripHeatmapView(APIView):
    """Corridor forecast grid for the same trip request as /trips/plan (reuses the cached plan)."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "heatmap"

    def post(self, request: Request) -> Response:
        serializer = TripPlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(heatmap_cached(serializer.to_trip_request()))


class GeocodeSuggestView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "suggest"

    def get(self, request: Request) -> Response:
        serializer = SuggestQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        places = here.autosuggest(serializer.validated_data["q"])
        return Response({"results": [p.__dict__ for p in places]})

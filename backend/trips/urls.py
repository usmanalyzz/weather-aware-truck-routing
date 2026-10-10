from django.urls import path

from . import views

urlpatterns = [
    path("health", views.health, name="health"),
    path("trips/plan", views.TripPlanView.as_view(), name="trip-plan"),
    path("trips/heatmap", views.TripHeatmapView.as_view(), name="trip-heatmap"),
    path("geocode/suggest", views.GeocodeSuggestView.as_view(), name="geocode-suggest"),
]

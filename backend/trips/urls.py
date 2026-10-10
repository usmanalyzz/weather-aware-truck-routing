from django.urls import path

from . import views

urlpatterns = [
    path("health", views.health, name="health"),
    path("trips/plan", views.TripPlanView.as_view(), name="trip-plan"),
    path("geocode/suggest", views.GeocodeSuggestView.as_view(), name="geocode-suggest"),
]

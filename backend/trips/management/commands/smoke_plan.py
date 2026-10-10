"""Live end-to-end check against the real HERE + Open-Meteo APIs: `python manage.py smoke_plan`."""

from datetime import UTC, datetime, timedelta

from django.core.management.base import BaseCommand

from trips.services.plan_trip import Location, TripRequest, plan_trip


class Command(BaseCommand):
    help = "Plan Chicago -> Denver departing tomorrow 06:00 UTC and print a summary (uses real APIs)."

    def add_arguments(self, parser):
        parser.add_argument("--load", type=int, default=42_000)
        parser.add_argument("--interval", type=int, default=25, choices=(10, 25, 50))

    def handle(self, *args, **opts):
        departure = (datetime.now(UTC) + timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
        result = plan_trip(
            TripRequest(
                origin=Location(41.8781, -87.6298, "Chicago, IL"),
                destination=Location(39.7392, -104.9903, "Denver, CO"),
                departure=departure,
                load_weight_lb=opts["load"],
                sample_interval_mi=opts["interval"],
            )
        )
        for route in result["routes"]:
            s = route["summary"]
            self.stdout.write(
                f"{route['label']}: {route['distance_mi']} mi, {route['duration_s'] / 3600:.1f} h, "
                f"{len(route['checkpoints'])} checkpoints, max {s['max_level']}, "
                f"severe+ {s['severe_or_worse_miles']} mi, high {s['high_miles']} mi, "
                f"avg {s['avg_risk']}, unknown {s['unknown_miles']} mi"
            )
        rec = result["recommendation"]
        self.stdout.write(self.style.SUCCESS(f"Recommended: {rec['route_id']}  ranking={rec['ranking']}"))
        for line in rec["rationale"] + result["notices"]:
            self.stdout.write(f"  - {line}")

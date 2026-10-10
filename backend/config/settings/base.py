"""Shared Django settings for the Weather-Aware Truck Routing API."""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
DEBUG = False
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "corsheaders",
    "rest_framework",
    "trips",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# Stateless API: no models are persisted. SQLite only satisfies Django internals.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "truck-routing",
        "OPTIONS": {"MAX_ENTRIES": 20_000},
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("API_THROTTLE_RATE", "120/min"),
        "plan": os.environ.get("PLAN_THROTTLE_RATE", "20/min"),
        "heatmap": os.environ.get("HEATMAP_THROTTLE_RATE", "20/min"),
        "suggest": os.environ.get("SUGGEST_THROTTLE_RATE", "120/min"),
    },
    "EXCEPTION_HANDLER": "trips.exceptions.api_exception_handler",
}

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")

# Third-party providers (keys are only ever used server-side).
HERE_API_KEY = os.environ.get("HERE_API_KEY", "")
TRUCK_TARE_WEIGHT_LB = int(os.environ.get("TRUCK_TARE_WEIGHT_LB", "35000"))
HEATMAP_MAX_POINTS = int(os.environ.get("HEATMAP_MAX_POINTS", "600"))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
    # httpx logs every request URL at INFO; keep provider traffic out of normal logs.
    "loggers": {"httpx": {"level": "WARNING"}},
}

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403

if not SECRET_KEY:  # noqa: F405
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set in production.")

DEBUG = False
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
# Platform health checks call over plain HTTP inside the network.
SECURE_REDIRECT_EXEMPT = [r"^api/health$"]
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

SILENCED_SYSTEM_CHECKS = [
    # Stateless JSON API: no cookies or session authentication, so there is nothing for CSRF to protect.
    "security.W003",
    # Served from a shared platform domain (*.onrender.com) we do not control: no subdomain HSTS or preload.
    "security.W005",
    "security.W021",
]

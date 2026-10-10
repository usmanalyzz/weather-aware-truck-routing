"""Uniform error envelope: {"error": {"code", "message", "fields"?}}. Internal details are never exposed."""

import logging

from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

from providers.errors import ProviderError

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    if isinstance(exc, ProviderError):
        logger.warning("Provider failure (%s): %s", exc.code, exc)
        return Response({"error": {"code": exc.code, "message": exc.public_message}}, status=exc.status)

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled error", exc_info=exc)
        return Response(
            {"error": {"code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again."}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, exceptions.ValidationError):
        response.data = {
            "error": {"code": "VALIDATION", "message": "Some inputs are invalid.", "fields": response.data}
        }
    elif isinstance(exc, exceptions.Throttled):
        response.data = {
            "error": {"code": "RATE_LIMITED", "message": "Too many requests. Please wait and try again."}
        }
    else:
        detail = response.data.get("detail", "Request failed.") if isinstance(response.data, dict) else ""
        response.data = {
            "error": {"code": getattr(exc, "default_code", "ERROR").upper(), "message": str(detail)}
        }
    return response

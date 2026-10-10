from .base import *  # noqa: F403

DEBUG = False
SECRET_KEY = "test-only-key"
ALLOWED_HOSTS = ["testserver"]
HERE_API_KEY = "test-here-key"
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}  # noqa: F405

"""Vercel entry point: Vercel's Python runtime serves the WSGI callable named `app`.

All paths are rewritten here (see vercel.json), so Django's own URL routing handles /api/*.
"""

import os
import sys
from pathlib import Path

# Make the project root (backend/) importable when Vercel runs this file from api/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

from config.wsgi import application  # noqa: E402

app = application

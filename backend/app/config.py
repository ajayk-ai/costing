"""Settings read from the .env file in the project root.

Relative paths in .env are resolved against the project root. Real environment
variables take precedence over values in .env.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]  # costing/
load_dotenv(ROOT / ".env", override=False)


def _path(key: str, default: str) -> Path:
    p = Path(os.getenv(key) or default).expanduser()
    return p if p.is_absolute() else (ROOT / p).resolve()


def _int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key) or default)
    except ValueError:
        raise SystemExit(f"{key} in .env must be a whole number, got {os.getenv(key)!r}")


APP_HOST = os.getenv("APP_HOST") or "127.0.0.1"
APP_PORT = _int("APP_PORT", 8000)
APP_RELOAD = (os.getenv("APP_RELOAD") or "false").lower() in ("1", "true", "yes")

DB_PATH = _path("DB_PATH", "backend/data/costing.db")
SEED_WORKBOOK = _path("SEED_WORKBOOK", "Departmnetwise Expense Report 2026-27 (2).xlsx")
FRONTEND_DIST = _path("FRONTEND_DIST", "frontend/dist")
RUNS_DIR = _path("RUNS_DIR", "backend/data/runs")  # processed SAP files

MAX_UPLOAD_MB = _int("MAX_UPLOAD_MB", 100)
CORS_ORIGINS = [o.strip() for o in (os.getenv("CORS_ORIGINS") or "").split(",") if o.strip()]

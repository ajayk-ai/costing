"""Test fixtures: the app runs against a throw-away database and runs folder.

Settings are read from the environment when `app.config` is first imported, so they
are set here, before any `app` import.
"""
import io
import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="costing-test-"))
os.environ["DB_PATH"] = str(_TMP / "costing.db")
os.environ["RUNS_DIR"] = str(_TMP / "runs")
os.environ["CORS_ORIGINS"] = ""
os.environ["AI_MODEL_FILE"] = str(_TMP / "ai" / "dept_model.joblib")  # no model unless a test trains one

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from openpyxl import Workbook  # noqa: E402

from app.main import app  # noqa: E402

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def make_xlsx(sheets: dict[str, list[list]]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for r in rows:
            ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def xlsx_file(content: bytes, name: str = "file.xlsx"):
    return {"file": (name, content, XLSX_MIME)}

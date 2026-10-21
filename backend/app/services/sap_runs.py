"""Run the SAP mapping, keep the processed workbook in RUNS_DIR and record the run in the database."""
from datetime import datetime
from pathlib import Path

from ..config import RUNS_DIR
from ..db import run_repo
from . import sap


def process_and_store(data: bytes, file_name: str) -> int:
    """Process an SAP export, save the result file, return the new run id. Raises ValueError on bad input."""
    summary, header, rows = sap.process(data, file_name)
    content = sap.build_output(summary, header, rows)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    stem = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in (file_name.rsplit(".", 1)[0] or "SAP_DATA"))[:60]
    out_name = f"{datetime.now():%Y%m%d_%H%M%S}_{stem}_REDEFINED.xlsx"
    (RUNS_DIR / out_name).write_bytes(content)
    return run_repo.add_run(file_name, summary, sap.preview(header, rows), out_name)


def remove_outputs(names: list[str]) -> None:
    for n in names:
        f = RUNS_DIR / n
        if f.parent == RUNS_DIR and f.is_file():
            f.unlink()


def output_path(run: dict | None) -> Path | None:
    """Path of a run's processed file, or None when the run or the file is gone."""
    f = RUNS_DIR / run["output"] if run else None
    return f if f and f.is_file() else None

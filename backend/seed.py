"""Load all masters from the expense report workbook.

Usage (from the project root):  uv run backend/seed.py [path-to-xlsx] [--replace]
Without a path, SEED_WORKBOOK from .env is used.
"""
import sys
from pathlib import Path

from app.config import DB_PATH, SEED_WORKBOOK
from app.db import master_repo
from app.domain.masters import MASTERS
from app.services.excel import parse_workbook

args = [a for a in sys.argv[1:] if not a.startswith("--")]
mode = "replace" if "--replace" in sys.argv else "merge"
path = Path(args[0]) if args else SEED_WORKBOOK
if not path.is_file():
    sys.exit(f"Workbook not found: {path}\nPass a path, or set SEED_WORKBOOK in .env")

print(f"Reading {path} ({mode}) into {DB_PATH}")
for t, (sheet, cols, rows) in parse_workbook(path.read_bytes()).items():
    label = MASTERS[t].label
    if not rows:
        print(f"  {label:45} sheet '{sheet}': empty, skipped")
        continue
    r = master_repo.import_rows(MASTERS[t], cols, rows, mode, path.name, sheet)
    print(f"  {label:45} +{r['inserted']} new, {r['updated']} updated, {r['unchanged']} unchanged, {r['skipped']} duplicate rows skipped")

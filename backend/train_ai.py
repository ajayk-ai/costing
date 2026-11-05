"""Train the AI department model from the history of correctly assigned lines.

Usage (from the project root):
    uv run backend/train_ai.py [history.csv|history.xlsx ...] [--skip-eval]

Several files can be given; they are stacked. Use the old history together with the current year's
Departmentwise Expense report (the tab "Departmentwise Expense report" of the workbook is read):
the department convention changes over time and the model must learn the current one.
Without a path, AI_HISTORY_FILE from .env is used. The history needs the columns listed in
HISTORY_COLS (backend/app/services/ai_dept.py): Vendor Code, Account, Account Desc., Order Des and
Main Department (the correct department); Cost Ctr is used only for the "never seen" check.
Save a large history as .csv first: reading a 770k-row .xlsx takes minutes.
Run it again every 3 months, or after a year end, so the model stays current.
"""
import sys
from pathlib import Path

from app.config import AI_HISTORY_FILE, AI_MODEL_FILE
from app.services import ai_dept

args = [a for a in sys.argv[1:] if not a.startswith("--")]
paths = [Path(a) for a in args] or [AI_HISTORY_FILE]
for path in paths:
    if not path.is_file():
        sys.exit(f"History file not found: {path}\nPass a path, or set AI_HISTORY_FILE in .env")

print("Reading " + ", ".join(map(str, paths)) + " ...")
try:
    info = ai_dept.train(paths, evaluate="--skip-eval" not in sys.argv)
except ValueError as e:
    sys.exit(str(e))
m = info["metrics"]
if m:
    print("threshold | % of correct lines flagged | % of injected errors caught")
    for r in m["thresholds"]:
        print(f"   {r['threshold']:.2f}   |          {r['pct_correct_lines_flagged']:6.2f}           |         {r['pct_injected_errors_caught']:5.1f}")
print(f"Model: {AI_MODEL_FILE}")

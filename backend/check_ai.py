"""Quick check: process a SAP file and print what the AI columns contain.
Usage: uv run backend/check_ai.py "Departmnetwise Expense Report 2026-27.xlsx"
"""
import sys

from app.services import sap

path = sys.argv[1]
summary, header, rows = sap.process(open(path, "rb").read(), path)
ai = summary.get("ai") or {}
print("columns in result:", len(header))
print("AI enabled:", ai.get("enabled"), "| note:", ai.get("note"))
print("AI flag counts:", ai.get("counts"))
cols = [c for c in ("Department", "AI Suggested Department", "AI Flag") if c in header]
idx = [header.index(c) for c in cols]
print(cols)
for r in rows[:5]:
    print([r[i] for i in idx])
blank = [sum(1 for r in rows if r[header.index(c)] in (None, "")) for c in cols]
print("blank cells per column:", dict(zip(cols, blank)), "of", len(rows), "rows")

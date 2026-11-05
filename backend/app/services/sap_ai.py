"""Add the AI department columns to the SAP result, right after Department, and summarise them.

The Department column itself (D1 rules) is never changed. If the AI check is switched off, has no
trained model, or fails, the result is returned exactly as before and the reason goes in `info`.
"""
from collections import Counter

from ..config import AI_ENABLED, AI_REVIEW_CONF, AI_WATCH_CONF
from . import ai_dept

SUGGESTED, FLAG, REASON = "AI Suggested Department", "AI Flag", "AI Reason"

# model input -> column of the SAP result
SOURCE = {"vendor": "Offst.acct", "account": "Account", "account_desc": "Account Description",
          "cost_ctr": "Cost Ctr", "order_desc": "Order Desc", "assigned": "Department"}


def column_names() -> list[str]:
    return [SUGGESTED, FLAG, REASON]


def add_columns(header: list, rows: list[list], known_depts=()):
    """Return (header, rows, info). header and rows are unchanged when the AI columns are not added."""
    if not AI_ENABLED:
        return header, rows, None
    if not ai_dept.available():
        return header, rows, {"enabled": False,
                              "note": "AI columns not added: the model is not trained yet (run: uv run backend/train_ai.py <history file>)."}
    missing = [c for c in SOURCE.values() if c not in header]
    if missing:
        return header, rows, {"enabled": False, "note": f"AI columns not added: result has no {', '.join(missing)} column."}
    idx = {h: header.index(h) for h in SOURCE.values()}
    try:
        res = ai_dept.check(
            [{k: r[idx[c]] for k, c in SOURCE.items()} for r in rows], known_depts=known_depts)
    except Exception as e:  # a model problem must never block the SAP mapping
        return header, rows, {"enabled": False, "note": f"AI columns not added: {e.__class__.__name__}: {e}"}

    # After the F1 columns when present (Department, GL Nature, Overhead, then the AI columns)
    pos = (header.index("Overhead") if "Overhead" in header else idx["Department"]) + 1
    names = column_names()
    new_rows = []
    for r, a in zip(rows, res):
        vals = [a["suggested"] or None, a["flag"], a["reason"] or None]
        new_rows.append(r[:pos] + vals + r[pos:])
    new_header = header[:pos] + names + header[pos:]

    counts = Counter(a["flag"] for a in res)
    pairs = Counter((rows[i][idx["Department"]], a["suggested"]) for i, a in enumerate(res) if a["flag"] == "REVIEW")
    by_dept: dict = {}
    for i, a in enumerate(res):
        d = by_dept.setdefault(rows[i][idx["Department"]] or "(blank)", {"rows": 0, "review": 0, "watch": 0})
        d["rows"] += 1
        d["review"] += a["flag"] == "REVIEW"
        d["watch"] += a["flag"] == "WATCH"
    info = {
        "enabled": True, "model": ai_dept.model_info(), "columns": names,
        "reviewConf": AI_REVIEW_CONF, "watchConf": AI_WATCH_CONF,
        "counts": {f: counts.get(f, 0) for f in ai_dept.FLAGS},
        "pairs": [{"assigned": a or "(blank)", "suggested": s, "rows": n} for (a, s), n in pairs.most_common(25)],
        "byDept": sorted(({"department": k, **v} for k, v in by_dept.items()),
                         key=lambda x: (-x["review"], -x["watch"], -x["rows"]))[:40],
    }
    return new_header, new_rows, info

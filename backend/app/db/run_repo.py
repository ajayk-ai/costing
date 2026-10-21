"""SAP processing runs: stored summary and preview; the output file lives in RUNS_DIR."""
import json

from .connection import _conn, tx


def add_run(file_name: str, summary: dict, preview: dict, output: str) -> int:
    with tx() as c:
        return c.execute("INSERT INTO sap_runs (file_name, rows, filled, unfilled, summary, preview, output) VALUES (?,?,?,?,?,?,?)",
                         (file_name, summary["rows"], summary["filled"], summary["unfilled"],
                          json.dumps(summary), json.dumps(preview), output)).lastrowid


def delete_runs(run_id: int | None = None) -> list[str]:
    """Delete one run, or all when run_id is None. Returns the output file names to remove."""
    with tx() as c:
        where, args = ("", ()) if run_id is None else (" WHERE id = ?", (run_id,))
        outputs = [r["output"] for r in c.execute(f"SELECT output FROM sap_runs{where}", args)]
        c.execute(f"DELETE FROM sap_runs{where}", args)
    return outputs


def list_runs(limit: int = 200):
    return [dict(r) for r in _conn.execute(
        "SELECT id, file_name, rows, filled, unfilled, created_at FROM sap_runs ORDER BY id DESC LIMIT ?", (limit,))]


def get_run(run_id: int):
    r = _conn.execute("SELECT * FROM sap_runs WHERE id = ?", (run_id,)).fetchone()
    if not r:
        return None
    return {"id": r["id"], "fileName": r["file_name"], "createdAt": r["created_at"], "output": r["output"],
            "summary": json.loads(r["summary"]), "preview": json.loads(r["preview"])}

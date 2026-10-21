"""Master rows: reads, single-row writes, bulk Excel import and upload history."""
import hashlib
import json
import sqlite3

from ..domain.masters import Column, Master
from .connection import _conn, tx


def columns_for(m: Master) -> list[Column]:
    if m.columns is not None:
        return m.columns
    row = _conn.execute("SELECT columns FROM master_columns WHERE type = ?", (m.type,)).fetchone()
    return [Column(c["key"], c["label"]) for c in json.loads(row["columns"])] if row else []


def _save_columns(c, m: Master, columns: list[Column]):
    if m.columns is None:
        c.execute("INSERT OR REPLACE INTO master_columns (type, columns) VALUES (?, ?)",
                  (m.type, json.dumps([{"key": x.key, "label": x.label} for x in columns])))


def _rkey(m: Master, columns: list[Column], rec: dict) -> str:
    if m.keyed:
        return rec[columns[0].key]
    joined = "\x1f".join(rec.get(c.key, "").strip().lower() for c in columns)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()


def _search(columns, rec) -> str:
    return " | ".join(rec.get(c.key, "") for c in columns).lower()


def _clean(columns, data: dict) -> dict:
    return {c.key: str(data.get(c.key, "") if data.get(c.key) is not None else "").strip() for c in columns}


# ---------- reads ----------

def stats():
    return {r["type"]: dict(r) for r in _conn.execute(
        "SELECT type, COUNT(*) AS count, MAX(updated_at) AS last_updated FROM master_rows GROUP BY type")}


def _order_by(m: Master) -> str:
    # Keyed masters sort numeric codes numerically, then alphanumeric ones; mapping tables keep sheet order.
    if m.keyed:
        return "ORDER BY (rkey GLOB '[0-9]*' AND rkey NOT GLOB '*[^0-9]*') DESC, CAST(rkey AS INTEGER), rkey"
    return "ORDER BY id"


def _row_out(r) -> dict:
    return {"id": r["id"], "updated_at": r["updated_at"], **json.loads(r["data"])}


def list_rows(m: Master, search: str, page: int, size: int):
    where, args = "type = ?", [m.type]
    for word in search.lower().split():
        where += " AND search LIKE ?"
        args.append(f"%{word}%")
    total = _conn.execute(f"SELECT COUNT(*) FROM master_rows WHERE {where}", args).fetchone()[0]
    rows = _conn.execute(f"SELECT id, data, updated_at FROM master_rows WHERE {where} {_order_by(m)} LIMIT ? OFFSET ?",
                         [*args, size, (page - 1) * size]).fetchall()
    return {"total": total, "page": page, "size": size, "rows": [_row_out(r) for r in rows]}


def all_rows(m: Master) -> list[dict]:
    return [json.loads(r["data"]) for r in _conn.execute(
        f"SELECT data FROM master_rows WHERE type = ? {_order_by(m)}", (m.type,))]


def logs(m: Master, limit: int = 200):
    return [dict(r) for r in _conn.execute("SELECT * FROM upload_log WHERE type = ? ORDER BY id DESC LIMIT ?", (m.type, limit))]


def delete_logs(m: Master, log_id: int | None = None) -> int:
    """Delete one upload-history entry, or all of this master's when log_id is None. Master rows are untouched."""
    with tx() as c:
        if log_id is None:
            return c.execute("DELETE FROM upload_log WHERE type = ?", (m.type,)).rowcount
        return c.execute("DELETE FROM upload_log WHERE type = ? AND id = ?", (m.type, log_id)).rowcount


# ---------- single-row writes ----------

class Conflict(Exception):
    pass


class NotFound(Exception):
    pass


def add_row(m: Master, data: dict) -> int:
    cols = columns_for(m)
    if not cols:
        raise ValueError("This master has no columns yet. Upload an Excel file first to define them.")
    rec = _clean(cols, data)
    if not any(rec.values()) or (m.keyed and not rec[cols[0].key]):
        raise ValueError(f"{cols[0].label} is required" if m.keyed else "Enter at least one value")
    with tx() as c:
        try:
            cur = c.execute("INSERT INTO master_rows (type, rkey, data, search) VALUES (?,?,?,?)",
                            (m.type, _rkey(m, cols, rec), json.dumps(rec), _search(cols, rec)))
        except sqlite3.IntegrityError:
            raise Conflict(f"{cols[0].label} {rec[cols[0].key]} already exists" if m.keyed else "An identical row already exists")
        return cur.lastrowid


def update_row(m: Master, row_id: int, data: dict):
    cols = columns_for(m)
    with tx() as c:
        old = c.execute("SELECT data FROM master_rows WHERE id = ? AND type = ?", (row_id, m.type)).fetchone()
        if not old:
            raise NotFound()
        rec = _clean(cols, data)
        if m.keyed:  # the code itself is not editable
            rec[cols[0].key] = json.loads(old["data"])[cols[0].key]
        try:
            c.execute("UPDATE master_rows SET rkey = ?, data = ?, search = ?, updated_at = datetime('now','localtime') WHERE id = ?",
                      (_rkey(m, cols, rec), json.dumps(rec), _search(cols, rec), row_id))
        except sqlite3.IntegrityError:
            raise Conflict("An identical row already exists")


def delete_row(m: Master, row_id: int):
    with tx() as c:
        if not c.execute("DELETE FROM master_rows WHERE id = ? AND type = ?", (row_id, m.type)).rowcount:
            raise NotFound()


# ---------- bulk import ----------

def import_rows(m: Master, columns: list[Column], rows: list[dict], mode: str, file_name: str, sheet_name: str) -> dict:
    """mode 'merge': keyed -> add new codes, update changed values (blank never overwrites);
                     mapping -> add rows not already present.
       mode 'replace': delete everything for this master first."""
    # De-duplicate within the file. Keyed: first occurrence wins, later duplicates only fill blanks.
    unique: dict[str, dict] = {}
    skipped = 0
    for rec in rows:
        k = _rkey(m, columns, rec)
        if k in unique:
            skipped += 1
            if m.keyed:
                for f, v in rec.items():
                    if v and not unique[k].get(f):
                        unique[k][f] = v
            continue
        unique[k] = dict(rec)

    inserted = updated = unchanged = 0
    with tx() as c:
        if mode == "replace":
            c.execute("DELETE FROM master_rows WHERE type = ?", (m.type,))
        _save_columns(c, m, columns)
        for k, rec in unique.items():
            ex = c.execute("SELECT id, data FROM master_rows WHERE type = ? AND rkey = ?", (m.type, k)).fetchone()
            if not ex:
                c.execute("INSERT INTO master_rows (type, rkey, data, search) VALUES (?,?,?,?)",
                          (m.type, k, json.dumps(rec), _search(columns, rec)))
                inserted += 1
                continue
            old = json.loads(ex["data"])
            new = {**old, **{f: v for f, v in rec.items() if v}}
            if new != old:
                c.execute("UPDATE master_rows SET data = ?, search = ?, updated_at = datetime('now','localtime') WHERE id = ?",
                          (json.dumps(new), _search(columns, new), ex["id"]))
                updated += 1
            else:
                unchanged += 1
        c.execute("INSERT INTO upload_log (type, file_name, sheet_name, mode, inserted, updated, unchanged, skipped, total) VALUES (?,?,?,?,?,?,?,?,?)",
                  (m.type, file_name, sheet_name, mode, inserted, updated, unchanged, skipped, len(rows)))
    return {"inserted": inserted, "updated": updated, "unchanged": unchanged, "skipped": skipped, "total": len(rows)}

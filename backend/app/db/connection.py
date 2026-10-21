"""SQLite connection, schema and the transaction helper shared by the repositories."""
import sqlite3
import threading
from contextlib import contextmanager

from ..config import DB_PATH

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
_conn.row_factory = sqlite3.Row
_lock = threading.Lock()

_conn.executescript("""
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS master_rows (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,
    rkey       TEXT NOT NULL,          -- code for keyed masters, hash of the row for mapping tables
    data       TEXT NOT NULL,          -- JSON {column_key: value}
    search     TEXT NOT NULL,          -- lower-cased values for searching
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (type, rkey)
);
CREATE TABLE IF NOT EXISTS master_columns (  -- columns learned from upload, for masters without fixed columns
    type    TEXT PRIMARY KEY,
    columns TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS upload_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, file_name TEXT, sheet_name TEXT, mode TEXT,
    inserted INTEGER, updated INTEGER, unchanged INTEGER, skipped INTEGER, total INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sap_runs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name  TEXT,
    rows       INTEGER, filled INTEGER, unfilled INTEGER,
    summary    TEXT NOT NULL,   -- JSON
    preview    TEXT NOT NULL,   -- JSON
    output     TEXT NOT NULL,   -- file name inside RUNS_DIR
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
""")


@contextmanager
def tx():
    with _lock:
        try:
            yield _conn
            _conn.commit()
        except Exception:
            _conn.rollback()
            raise

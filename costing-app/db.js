// SQLite storage using Node's built-in node:sqlite (Node 22.13+).
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'costing.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS master_data (
    type        TEXT NOT NULL,
    code        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (type, code)
  );
  CREATE TABLE IF NOT EXISTS upload_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,
    file_name  TEXT,
    sheet_name TEXT,
    mode       TEXT,
    inserted   INTEGER, updated INTEGER, unchanged INTEGER, skipped INTEGER,
    total      INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const q = {
  get: db.prepare('SELECT code, description FROM master_data WHERE type = ? AND code = ?'),
  insert: db.prepare(`INSERT INTO master_data (type, code, description) VALUES (?, ?, ?)`),
  update: db.prepare(`UPDATE master_data SET description = ?, updated_at = datetime('now','localtime') WHERE type = ? AND code = ?`),
  del: db.prepare('DELETE FROM master_data WHERE type = ? AND code = ?'),
  delAll: db.prepare('DELETE FROM master_data WHERE type = ?'),
  stats: db.prepare(`SELECT type, COUNT(*) AS count, MAX(updated_at) AS last_updated FROM master_data GROUP BY type`),
  log: db.prepare(`INSERT INTO upload_log (type, file_name, sheet_name, mode, inserted, updated, unchanged, skipped, total) VALUES (?,?,?,?,?,?,?,?,?)`),
  logs: db.prepare(`SELECT * FROM upload_log WHERE type = ? ORDER BY id DESC LIMIT 10`),
};

function list(type, { search = '', page = 1, size = 50 }) {
  const like = `%${search.trim()}%`;
  const where = search.trim() ? 'AND (code LIKE ? OR description LIKE ?)' : '';
  const args = search.trim() ? [type, like, like] : [type];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM master_data WHERE type = ? ${where}`).get(...args).n;
  // Numeric codes sort numerically, alphanumeric codes after them.
  const rows = db.prepare(
    `SELECT code, description, updated_at FROM master_data WHERE type = ? ${where}
     ORDER BY (code GLOB '[0-9]*' AND code NOT GLOB '*[^0-9]*') DESC, CAST(code AS INTEGER), code
     LIMIT ? OFFSET ?`
  ).all(...args, size, (page - 1) * size);
  return { total, page, size, rows };
}

function all(type) {
  return db.prepare(
    `SELECT code, description FROM master_data WHERE type = ?
     ORDER BY (code GLOB '[0-9]*' AND code NOT GLOB '*[^0-9]*') DESC, CAST(code AS INTEGER), code`
  ).all(type);
}

function upsertOne(type, code, description) {
  const existing = q.get.get(type, code);
  if (existing) q.update.run(description, type, code);
  else q.insert.run(type, code, description);
  return { created: !existing };
}

// mode = 'merge'   : add new codes, update changed descriptions (a blank description never overwrites).
// mode = 'replace' : delete all rows of this type, then load the file.
function importRows(type, rows, mode, meta = {}) {
  return tx(() => {
    if (mode === 'replace') q.delAll.run(type);
    const seen = new Map();
    let skipped = 0;
    for (const r of rows) {
      // Duplicate codes in the file: keep the first non-blank description.
      if (seen.has(r.code)) {
        if (!seen.get(r.code) && r.description) seen.set(r.code, r.description);
        else skipped++;
        continue;
      }
      seen.set(r.code, r.description);
    }
    let inserted = 0, updated = 0, unchanged = 0;
    for (const [code, description] of seen) {
      const ex = q.get.get(type, code);
      if (!ex) { q.insert.run(type, code, description); inserted++; }
      else if (description && ex.description !== description) { q.update.run(description, type, code); updated++; }
      else unchanged++;
    }
    const res = { inserted, updated, unchanged, skipped, total: rows.length };
    q.log.run(type, meta.fileName || null, meta.sheetName || null, mode, inserted, updated, unchanged, skipped, rows.length);
    return res;
  });
}

module.exports = {
  list, all, upsertOne, importRows,
  get: (t, c) => q.get.get(t, c),
  remove: (t, c) => q.del.run(t, c).changes,
  stats: () => q.stats.all(),
  logs: (t) => q.logs.all(t),
};

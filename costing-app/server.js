// Costing master data web app — plain Node HTTP server, no framework.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { MASTERS, parseForType, parseWorkbook, buildXlsx } = require('./masters');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const MAX_UPLOAD = 100 * 1024 * 1024;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8', ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('File too large (max 100 MB)'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const readJson = async (req) => { const b = await readBody(req, 1024 * 1024); return b.length ? JSON.parse(b.toString('utf8')) : {}; };
const fail = (status, message) => Object.assign(new Error(message), { status });
const fileNameOf = (req) => { try { return decodeURIComponent(req.headers['x-file-name'] || ''); } catch { return ''; } };

function checkType(type) { if (!MASTERS[type]) throw fail(404, `Unknown master type "${type}"`); return type; }

function checkUpload(buf) {
  if (!buf.length) throw fail(400, 'No file received');
  // .xlsx is a ZIP (PK..); .xls is OLE (D0 CF 11 E0).
  const zip = buf[0] === 0x50 && buf[1] === 0x4b;
  const ole = buf[0] === 0xd0 && buf[1] === 0xcf;
  if (!zip && !ole) throw fail(400, 'Not an Excel file. Please upload .xlsx or .xls');
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const m = req.method;

  if (m === 'GET' && parts[0] === 'masters' && parts.length === 1) {
    const stats = Object.fromEntries(db.stats().map((s) => [s.type, s]));
    return send(res, 200, Object.entries(MASTERS).map(([type, d]) => ({
      type, label: d.label, codeLabel: d.codeLabel, descLabel: d.descLabel,
      count: stats[type]?.count || 0, lastUpdated: stats[type]?.last_updated || null,
    })));
  }

  // Full workbook upload: updates every master tab it finds.
  if (m === 'POST' && parts[0] === 'upload-workbook') {
    const mode = url.searchParams.get('mode') === 'replace' ? 'replace' : 'merge';
    const buf = await readBody(req, MAX_UPLOAD); checkUpload(buf);
    const parsed = parseWorkbook(buf);
    if (!Object.keys(parsed).length) throw fail(400, 'No master sheets found. Expected tabs like "Material Description", "Cost Center Description", "Order Description", "Offsetting Description", "Account Description".');
    const results = {};
    for (const [type, { sheetName, rows }] of Object.entries(parsed)) {
      results[type] = { label: MASTERS[type].label, sheetName: sheetName.trim(), ...db.importRows(type, rows, mode, { fileName: fileNameOf(req), sheetName }) };
    }
    return send(res, 200, { mode, results });
  }

  if (parts[0] !== 'masters') throw fail(404, 'Not found');
  const type = checkType(parts[1]);
  const sub = parts[2];

  if (parts.length === 2) {
    if (m === 'GET') {
      const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
      const size = Math.min(500, Math.max(1, parseInt(url.searchParams.get('size')) || 50));
      return send(res, 200, db.list(type, { search: url.searchParams.get('q') || '', page, size }));
    }
    if (m === 'POST') {
      const { code, description } = await readJson(req);
      const c = String(code ?? '').trim();
      if (!c) throw fail(400, 'Code is required');
      if (db.get(type, c)) throw fail(409, `Code ${c} already exists`);
      db.upsertOne(type, c, String(description ?? '').trim());
      return send(res, 201, { ok: true });
    }
  }

  if (sub === 'upload' && m === 'POST') {
    const mode = url.searchParams.get('mode') === 'replace' ? 'replace' : 'merge';
    const buf = await readBody(req, MAX_UPLOAD); checkUpload(buf);
    const { sheetName, rows } = parseForType(buf, type);
    if (!rows.length) throw fail(400, `No data rows found in sheet "${sheetName}"`);
    const r = db.importRows(type, rows, mode, { fileName: fileNameOf(req), sheetName });
    return send(res, 200, { mode, sheetName: sheetName.trim(), ...r });
  }

  if (sub === 'export' && m === 'GET') {
    const buf = buildXlsx(type, db.all(type));
    const name = `${MASTERS[type].label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return send(res, 200, buf, { 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="${name}"` });
  }

  if (sub === 'template' && m === 'GET') {
    return send(res, 200, buildXlsx(type, []), { 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="${MASTERS[type].label.replace(/\s+/g, '_')}_Template.xlsx"` });
  }

  if (sub === 'logs' && m === 'GET') return send(res, 200, db.logs(type));

  if (sub === 'item' && parts[3] !== undefined) {
    const code = decodeURIComponent(parts[3]);
    if (m === 'PUT') {
      if (!db.get(type, code)) throw fail(404, 'Code not found');
      const { description } = await readJson(req);
      db.upsertOne(type, code, String(description ?? '').trim());
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      if (!db.remove(type, code)) throw fail(404, 'Code not found');
      return send(res, 200, { ok: true });
    }
  }

  throw fail(404, 'Not found');
}

function serveStatic(res, pathname) {
  const file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(res, decodeURIComponent(url.pathname));
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : `Server error: ${e.message}` });
  }
}).listen(PORT, () => console.log(`Costing app running at http://localhost:${PORT}`));

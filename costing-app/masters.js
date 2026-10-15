// Master data type definitions and Excel import logic.
const XLSX = require('xlsx');

// `sheet` matches the tab name in the full expense-report workbook.
// `codeHeaders` / `descHeaders` are accepted column headings (case/space-insensitive).
const MASTERS = {
  material: {
    label: 'Material Description',
    codeLabel: 'Material',
    descLabel: 'Material Description',
    sheet: /material\s*desc/i,
    codeHeaders: ['material', 'material code', 'material no', 'material number'],
    descHeaders: ['material desc', 'material description', 'description'],
  },
  offsetting: {
    label: 'Offsetting Description',
    codeLabel: 'Offsetting Account',
    descLabel: 'Offsetting Description',
    sheet: /offset\w*\s*desc/i,
    codeHeaders: ['offst.acct', 'offst acct', 'offsetting account', 'offset account', 'offsetting'],
    descHeaders: ['offst.acct desc', 'offst acct desc', 'offsetting description', 'offset description', 'description'],
  },
  order: {
    label: 'Order Description',
    codeLabel: 'Order (IO)',
    descLabel: 'Order Description',
    sheet: /order\s*desc/i,
    codeHeaders: ['io', 'order', 'internal order', 'order no', 'order number'],
    descHeaders: ['io description', 'io desc', 'order description', 'description'],
  },
  costcenter: {
    label: 'Cost Center Description',
    codeLabel: 'Cost Center',
    descLabel: 'Cost Center Description',
    sheet: /cost\s*cent\w*\s*desc/i,
    codeHeaders: ['cost ctr', 'cost center', 'cost centre', 'cc', 'costcenter'],
    descHeaders: ['cc description', 'cc desc', 'cost center description', 'cost centre description', 'description'],
  },
  account: {
    label: 'Account Description',
    codeLabel: 'Account Number',
    descLabel: 'Account Description',
    sheet: /^\s*account\s*desc/i,
    codeHeaders: ['account number', 'account', 'account no', 'gl account', 'g/l account'],
    descHeaders: ['account description', 'account desc', 'description'],
  },
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

function cellToCode(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v).trim();
  return String(v).trim();
}

// Reads one sheet into [{code, description}] using header detection,
// falling back to column A = code, column B = description.
function rowsFromSheet(ws, def) {
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
  if (!grid.length) return [];

  let codeCol = 0, descCol = 1, start = 0;
  // Look for a header row among the first 10 rows.
  for (let r = 0; r < Math.min(10, grid.length); r++) {
    const heads = grid[r].map(norm);
    const c = heads.findIndex((h) => def.codeHeaders.includes(h));
    const d = heads.findIndex((h, i) => i !== c && def.descHeaders.includes(h));
    if (c !== -1 && d !== -1) { codeCol = c; descCol = d; start = r + 1; break; }
  }
  // No recognised header: skip row 1 if it looks like text headings.
  if (start === 0 && grid[0] && typeof grid[0][0] === 'string' && /[a-z]{3,}/i.test(grid[0][0]) && /desc/i.test(String(grid[0][1] || ''))) start = 1;

  const out = [];
  for (let r = start; r < grid.length; r++) {
    const code = cellToCode(grid[r][codeCol]);
    if (!code) continue;
    out.push({ code, description: String(grid[r][descCol] ?? '').trim() });
  }
  return out;
}

// Upload for one master type: use the matching sheet if present, else the first sheet.
function parseForType(buffer, type) {
  const def = MASTERS[type];
  const names = XLSX.read(buffer, { type: 'buffer', bookSheets: true }).SheetNames;
  const sheetName = names.find((n) => def.sheet.test(n)) || names[0];
  const wb = XLSX.read(buffer, { type: 'buffer', sheets: [sheetName] });
  return { sheetName, rows: rowsFromSheet(wb.Sheets[sheetName], def) };
}

// Upload of a full workbook: import every master whose tab is found.
function parseWorkbook(buffer) {
  const names = XLSX.read(buffer, { type: 'buffer', bookSheets: true }).SheetNames;
  const found = {};
  for (const [type, def] of Object.entries(MASTERS)) {
    const n = names.find((s) => def.sheet.test(s));
    if (n) found[type] = n;
  }
  const wanted = Object.values(found);
  if (!wanted.length) return {};
  const wb = XLSX.read(buffer, { type: 'buffer', sheets: wanted });
  const result = {};
  for (const [type, n] of Object.entries(found)) {
    result[type] = { sheetName: n, rows: rowsFromSheet(wb.Sheets[n], MASTERS[type]) };
  }
  return result;
}

function buildXlsx(type, rows) {
  const def = MASTERS[type];
  const aoa = [[def.codeLabel, def.descLabel], ...rows.map((r) => [/^\d+$/.test(r.code) && r.code.length < 16 ? Number(r.code) : r.code, r.description])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 18 }, { wch: 50 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, def.label);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { MASTERS, parseForType, parseWorkbook, buildXlsx };

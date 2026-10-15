// One-time load of master data from the expense report workbook.
// Usage: node seed.js [path-to-xlsx]   (defaults to the report in the parent folder)
const fs = require('fs');
const path = require('path');
const { parseWorkbook, MASTERS } = require('./masters');
const db = require('./db');

const file = process.argv[2] || path.join(__dirname, '..', 'Departmnetwise Expense Report 2026-27 (2).xlsx');
console.log('Reading', file);
const parsed = parseWorkbook(fs.readFileSync(file));
for (const [type, { sheetName, rows }] of Object.entries(parsed)) {
  const r = db.importRows(type, rows, 'merge', { fileName: path.basename(file), sheetName });
  console.log(`${MASTERS[type].label.padEnd(25)} sheet "${sheetName.trim()}": +${r.inserted} new, ${r.updated} updated, ${r.unchanged} unchanged, ${r.skipped} duplicate rows skipped`);
}

// Columns the mapping adds to the SAP data (highlighted in the UI and the output file).
export const ADDED = new Set(['Month', 'Offst.acct Desc', 'Account Description', 'P&L Group', 'CC Description', 'Order Desc', 'Material desc', 'Department']);

// 0 -> A, 25 -> Z, 26 -> AA
export const colLetter = (i) => (i >= 26 ? colLetter(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

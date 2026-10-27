// Columns the mapping adds to the SAP data (highlighted in the UI and the output file).
export const ADDED = new Set(['Month', 'Offst.acct Desc', 'Account Description', 'P&L Group', 'CC Description', 'Order Desc', 'Material desc', 'Department', 'GL Nature', 'Overhead',
  'AI Suggested Department', 'AI Flag', 'AI Reason']);

// AI department check: the flag column drives the colours.
export const AI_FLAG = 'AI Flag';
export const FLAG_LABEL = { REVIEW: 'Review', WATCH: 'Watch', NO_DEPT: 'No department', OK: 'OK' };

// 0 -> A, 25 -> Z, 26 -> AA
export const colLetter = (i) => (i >= 26 ? colLetter(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

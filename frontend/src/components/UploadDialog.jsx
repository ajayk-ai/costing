import { useState } from 'react';
import { api, fmt } from '../api.js';
import Modal from './Modal.jsx';

const summary = (r) =>
  `${fmt(r.inserted)} new · ${fmt(r.updated)} updated · ${fmt(r.unchanged)} unchanged` + (r.skipped ? ` · ${fmt(r.skipped)} duplicate rows skipped` : '');

// Upload for one master (`master`), or the full expense-report workbook (`workbook`).
export default function UploadDialog({ master, workbook, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [status, setStatus] = useState(null); // {kind: busy|ok|error, text}

  const hint = workbook
    ? 'Select the Departmentwise Expense Report workbook. Every master tab found in it is updated. Empty tabs are skipped.'
    : master.columns.length
      ? `Columns: ${master.columns.map((c) => c.label).join(', ')}. If the file has a "${master.label}" tab it is used, otherwise the first sheet.`
      : 'The first row of the sheet is used as the column headings.';

  const mergeText = workbook || master.keyed
    ? 'add new codes, update changed values, keep everything else'
    : 'add rows that are not already present, keep everything else';

  async function go() {
    if (!file) { setStatus({ kind: 'error', text: 'Choose an Excel file first.' }); return; }
    if (mode === 'replace' && !confirmReplace) { setStatus({ kind: 'error', text: 'Tick the confirmation box to replace existing records.' }); return; }
    setStatus({ kind: 'busy', text: `Uploading ${file.name} (${(file.size / 1048576).toFixed(1)} MB)… large workbooks can take up to a minute.` });
    try {
      const r = workbook ? await api.uploadWorkbook(file, mode) : await api.upload(master.type, file, mode);
      const text = workbook
        ? [...Object.values(r.results).map((x) => `${x.label}: ${summary(x)}`), ...r.emptySheets.map((l) => `${l}: tab is empty, skipped`)].join('\n')
        : `Sheet "${r.sheetName}": ${summary(r)}`;
      setStatus({ kind: 'ok', text });
      onDone();
    } catch (e) { setStatus({ kind: 'error', text: e.message }); }
  }

  const busy = status?.kind === 'busy';
  return (
    <Modal title={workbook ? 'Upload full workbook' : `Upload · ${master.label}`} onClose={busy ? () => {} : onClose} onSubmit={go}
      footer={<><button type="button" className="btn" onClick={onClose} disabled={busy}>Close</button><button type="submit" className="btn primary" disabled={busy}>Upload</button></>}>
      <p className="hint">{hint}</p>
      <input className="file" type="file" accept=".xlsx,.xlsm" onChange={(e) => { setFile(e.target.files[0] || null); setStatus(null); }} />
      <fieldset>
        <legend>Update mode</legend>
        <label><input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /> <b>Merge</b>: {mergeText}</label>
        <label><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> <b>Replace all</b>: delete existing records{workbook ? ' of each master found' : ''} and load only this file</label>
        {mode === 'replace' && (
          <label className="warn"><input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} /> I understand existing records will be deleted</label>
        )}
      </fieldset>
      {status && <div className={`result ${status.kind}`}>{status.text}</div>}
    </Modal>
  );
}

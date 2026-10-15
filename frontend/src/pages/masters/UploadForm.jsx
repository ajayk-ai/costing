import { useState } from 'react';
import { api, fmt } from '../../api.js';
import Button from '../../ui/Button.jsx';
import Alert from '../../ui/Alert.jsx';
import FileDrop from '../../ui/FileDrop.jsx';
import Spinner from '../../ui/Spinner.jsx';
import { useToast } from '../../ui/Toast.jsx';

const counts = (r) =>
  `${fmt(r.inserted)} new · ${fmt(r.updated)} updated · ${fmt(r.unchanged)} unchanged` + (r.skipped ? ` · ${fmt(r.skipped)} duplicate rows skipped` : '');

// Upload for one master (`master`), or the full expense-report workbook (`workbook`).
// Not a <form>: it is also placed inside the Modal's form. `after` renders next to the Upload button.
export default function UploadForm({ master, workbook, onDone, onBusy, after }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [status, setStatus] = useState(null); // { kind: busy | ok | error, lines }

  const mergeText = workbook || master.keyed
    ? 'Add new codes and update changed values. Nothing is deleted.'
    : 'Add rows that are not already present. Nothing is deleted.';

  async function go() {
    if (!file) { setStatus({ kind: 'error', lines: ['Choose an Excel file first.'] }); return; }
    if (mode === 'replace' && !confirmReplace) { setStatus({ kind: 'error', lines: ['Tick the confirmation box to replace existing records.'] }); return; }
    setStatus({ kind: 'busy' }); onBusy?.(true);
    try {
      const r = workbook ? await api.uploadWorkbook(file, mode) : await api.upload(master.type, file, mode);
      const lines = workbook
        ? [...Object.values(r.results).map((x) => `${x.label}: ${counts(x)}`), ...r.emptySheets.map((l) => `${l}: tab is empty, skipped`)]
        : [`Sheet "${r.sheetName}": ${counts(r)}`];
      setStatus({ kind: 'ok', lines });
      setFile(null); setMode('merge'); setConfirmReplace(false);
      toast(workbook ? 'Workbook uploaded' : `${master.label} updated`);
      onDone?.();
    } catch (e) { setStatus({ kind: 'error', lines: [e.message] }); }
    onBusy?.(false);
  }

  const busy = status?.kind === 'busy';
  return (
    <div className="stack">
      <FileDrop file={file} disabled={busy} hint={workbook ? 'The full expense report .xlsx' : '.xlsx file'}
        onFile={(f) => { setFile(f); if (status?.kind !== 'ok') setStatus(null); }} />

      <div className="choice-group" role="radiogroup" aria-label="Update mode">
        <label className={`choice${mode === 'merge' ? ' on' : ''}`}>
          <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} disabled={busy} />
          <span><b>Merge</b><small>{mergeText}</small></span>
        </label>
        <label className={`choice${mode === 'replace' ? ' on danger' : ''}`}>
          <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} disabled={busy} />
          <span><b>Replace all</b><small>Delete the existing records{workbook ? ' of each master found' : ''}, then load only this file.</small></span>
        </label>
      </div>
      {mode === 'replace' && (
        <label className="confirm">
          <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} disabled={busy} />
          I understand the existing records will be deleted
        </label>
      )}

      <div className="form-actions">
        <Button variant="primary" icon={busy ? undefined : 'upload'} disabled={busy || !file} onClick={go}>
          {busy ? <><Spinner /> Uploading…</> : 'Upload'}
        </Button>
        {busy ? <span className="muted">Large workbooks can take up to a minute.</span> : after}
      </div>

      {status?.kind === 'ok' && <Alert tone="success" title="Upload complete"><ul className="plain">{status.lines.map((l) => <li key={l}>{l}</li>)}</ul></Alert>}
      {status?.kind === 'error' && <Alert tone="error" onClose={() => setStatus(null)}>{status.lines[0]}</Alert>}
    </div>
  );
}

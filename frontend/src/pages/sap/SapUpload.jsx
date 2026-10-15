import { useState } from 'react';
import { api } from '../../api.js';
import Card from '../../ui/Card.jsx';
import Button from '../../ui/Button.jsx';
import FileDrop from '../../ui/FileDrop.jsx';
import Alert from '../../ui/Alert.jsx';
import Spinner from '../../ui/Spinner.jsx';

const NEEDED = ['Offst.acct', 'Account', 'Cost Ctr', 'Order', 'Material', 'Year/month', 'Assignment'];
const STEPS = [
  ['Month', 'from Year/month (fiscal period 1 = April)'],
  ['Descriptions', 'Offst.acct, Account, Cost Ctr, Order and Material looked up in the description masters'],
  ['P&L Group', 'by Account, from the P&L Group master'],
  ['Department', 'the D1 rules, applied one after another'],
  ['Layout', 'columns in REDIFINED DATA order, dates as dd-mm-yyyy'],
];

export default function SapUpload({ onProcessed }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function process(e) {
    e.preventDefault();
    if (!file) { setError('Choose the SAP data Excel file first.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.sapProcess(file);
      setFile(null);
      onProcessed(r);
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  return (
    <div className="split">
      <Card title="Process a file" icon="upload" subtitle='Uses the "SAP DATA" tab if present, otherwise the first sheet.'>
        <form className="stack" onSubmit={process}>
          <FileDrop file={file} disabled={busy} hint=".xlsx export from SAP" onFile={(f) => { setFile(f); setError(''); }} />
          <div className="needed">
            <span>Needed columns</span>
            {NEEDED.map((c) => <code key={c}>{c}</code>)}
          </div>
          <div className="form-actions">
            <Button type="submit" variant="primary" icon={busy ? undefined : 'shuffle'} disabled={busy || !file}>
              {busy ? <><Spinner /> Processing…</> : 'Process file'}
            </Button>
            {busy && <span className="muted">Large files can take a minute.</span>}
          </div>
          {error && <Alert tone="error" title="Could not process the file" onClose={() => setError('')}>{error}</Alert>}
        </form>
      </Card>

      <Card title="What happens" icon="info">
        <ol className="steps">
          {STEPS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}
        </ol>
        <p className="hint">The result opens in the Result tab and is kept in History for download later.</p>
      </Card>
    </div>
  );
}

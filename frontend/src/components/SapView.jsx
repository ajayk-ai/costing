import { useEffect, useState } from 'react';
import { api, fmt } from '../api.js';

// Upload SAP data -> add Month, descriptions and Department -> download the result.
export default function SapView({ onOpenMaster }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [run, setRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [tab, setTab] = useState('all');

  const loadRuns = () => api.sapRuns().then(setRuns).catch(() => {});
  useEffect(() => { loadRuns(); }, []);

  async function go(e) {
    e.preventDefault();
    if (!file) { setError('Choose the SAP data Excel file first.'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.sapProcess(file);
      setRun(r); setTab(r.summary.unfilled ? 'unfilled' : 'all');
      loadRuns();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  async function open(id) {
    try { setRun(await api.sapRun(id)); setTab('all'); setError(''); } catch (err) { setError(err.message); }
  }

  const s = run?.summary;
  const rows = run ? run.preview[tab] : [];
  const pct = (n) => (s.rows ? `${((n / s.rows) * 100).toFixed(1)}%` : '0%');

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h1>SAP Data Mapping</h1>
          <p className="meta">Adds Month, Offst.acct Desc, Account Description, CC Description, Order Desc, Material desc and Department to an SAP export.</p>
        </div>
      </div>

      <form className="sap-upload" onSubmit={go}>
        <input className="file" type="file" accept=".xlsx,.xlsm" onChange={(e) => { setFile(e.target.files[0] || null); setError(''); }} />
        <button className="btn primary" disabled={busy}>{busy ? 'Processing…' : 'Process'}</button>
      </form>
      <p className="hint">Uses the tab named "SAP DATA" if present, otherwise the first sheet. Needed columns: Offst.acct, Account, Cost Ctr, Order, Material, Year/month, Assignment.</p>
      {busy && <div className="result busy">Reading {file?.name} and mapping… large files can take a minute.</div>}
      {error && <div className="banner error">{error}</div>}

      {s && (
        <>
          <div className="run-head">
            <div>
              <h2>{run.fileName || 'SAP data'}</h2>
              <p className="meta">Processed {run.createdAt} · sheet "{s.sheet}"</p>
            </div>
            <a className="btn primary" href={api.sapDownloadUrl(run.id)}>Download result .xlsx</a>
          </div>

          <div className="stats">
            <div className="stat"><span>Rows</span><b>{fmt(s.rows)}</b></div>
            <div className="stat ok"><span>Department filled</span><b>{fmt(s.filled)}</b><small>{pct(s.filled)}</small></div>
            <div className={`stat ${s.unfilled ? 'warn' : ''}`}><span>Department blank</span><b>{fmt(s.unfilled)}</b><small>{pct(s.unfilled)}</small></div>
          </div>

          <h3>Department: D1 rules applied one after another</h3>
          <p className="hint">Each step only looks at rows that are still blank after the steps above it.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>D1 master</th><th>Matched on</th><th className="num">Master codes</th><th className="num">Rows filled</th><th className="num">Still blank</th></tr></thead>
              <tbody>
                {s.steps.map((st, i) => (
                  <tr key={st.master} className={st.skipped ? 'muted' : ''}>
                    <td>{i + 1}</td>
                    <td><button className="link" onClick={() => onOpenMaster(st.master)}>{st.label}</button>{st.skipped && <span className="tag">no data, skipped</span>}</td>
                    <td>{st.matchOn}</td>
                    <td className="num">{fmt(st.masterRows)}</td>
                    <td className="num"><b>{fmt(st.filled)}</b></td>
                    <td className="num">{fmt(st.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {s.unmatchedAccounts.length > 0 && (
            <details className="history" open={s.unfilled > 0 && s.unfilled < 500}>
              <summary>Accounts with no department ({fmt(s.unfilled)} rows)</summary>
              <div className="chips">
                {s.unmatchedAccounts.map((a) => <span className="chip" key={a.account}>{a.account}{a.description && ` · ${a.description}`} <b>{fmt(a.rows)}</b></span>)}
              </div>
            </details>
          )}

          <h3>Descriptions from masters</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>New column</th><th>Looked up by</th><th className="num">Found</th><th className="num">Key blank</th><th className="num">Code not in master</th></tr></thead>
              <tbody>
                {s.descriptions.map((d) => (
                  <tr key={d.column}>
                    <td>{d.column}</td>
                    <td>{d.present ? d.keyColumn : <span className="blank">{d.keyColumn} column not in file</span>}</td>
                    <td className="num">{fmt(d.matched)}</td>
                    <td className="num">{fmt(d.blank)}</td>
                    <td className="num">
                      {d.missingRows ? (
                        <details className="inline">
                          <summary>{fmt(d.missingRows)} rows · {fmt(d.missingCodeCount)} codes</summary>
                          <div className="chips">
                            {d.missingCodes.map((c) => <span className="chip" key={c.code}>{c.code} <b>{fmt(c.rows)}</b></span>)}
                            {d.missingCodeCount > d.missingCodes.length && <span className="chip muted">+{fmt(d.missingCodeCount - d.missingCodes.length)} more</span>}
                          </div>
                          <button className="link" onClick={() => onOpenMaster(d.master)}>Open {d.label} →</button>
                        </details>
                      ) : '0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {s.notes.length > 0 && <ul className="notes">{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

          <div className="preview-head">
            <h3>Preview</h3>
            <div className="seg">
              <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>First 100 rows</button>
              <button className={tab === 'unfilled' ? 'on' : ''} onClick={() => setTab('unfilled')}>Department blank ({fmt(s.unfilled)})</button>
            </div>
          </div>
          <div className="table-wrap preview">
            <table>
              <thead><tr>{s.header.map((h, i) => <th key={i} className={ADDED.has(h) ? 'added' : ''}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={ADDED.has(s.header[j]) ? 'added' : ''}>{v}</td>)}</tr>)}
                {!rows.length && <tr><td colSpan={s.header.length} className="empty">No rows</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      <details className="history" open={!run}>
        <summary>Previous runs</summary>
        <div className="table-wrap">
          <table className="mini">
            <thead><tr><th>When</th><th>File</th><th className="num">Rows</th><th className="num">Filled</th><th className="num">Blank</th><th /></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at}</td><td>{r.file_name}</td>
                  <td className="num">{fmt(r.rows)}</td><td className="num">{fmt(r.filled)}</td><td className="num">{fmt(r.unfilled)}</td>
                  <td className="c-act"><button className="link" onClick={() => open(r.id)}>View</button><a className="link" href={api.sapDownloadUrl(r.id)}>Download</a></td>
                </tr>
              ))}
              {!runs.length && <tr><td colSpan={6} className="empty">No runs yet</td></tr>}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

const ADDED = new Set(['Month', 'Offst.acct Desc', 'Account Description', 'CC Description', 'Order Desc', 'Material desc', 'Department', 'Department Source']);

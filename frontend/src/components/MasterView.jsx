import { useEffect, useState } from 'react';
import { api, fmt } from '../api.js';
import EditDialog from './EditDialog.jsx';
import UploadDialog from './UploadDialog.jsx';
import Modal from './Modal.jsx';

export default function MasterView({ master, version, onChanged }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState(''); // debounced
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [deleting, setDeleting] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const cols = master.columns;

  useEffect(() => {
    const t = setTimeout(() => { setQuery(q); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    api.rows(master.type, { q: query, page, size })
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch((e) => live && setError(e.message));
    api.logs(master.type).then((l) => live && setLogs(l)).catch(() => {});
    return () => { live = false; };
  }, [master.type, query, page, size, version]);

  const pages = Math.max(1, Math.ceil(data.total / size));

  async function confirmDelete() {
    try {
      await api.remove(master.type, deleting.id);
      setDeleting(null);
      onChanged();
    } catch (e) { setError(e.message); setDeleting(null); }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h1>{master.label}</h1>
          <p className="meta">
            {master.count ? `${fmt(master.count)} records · last updated ${master.lastUpdated}` : 'No records yet. Upload an Excel file to start.'}
            {!master.keyed && <> · mapping table: repeated codes are allowed</>}
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setUploadOpen(true)}>Upload .xlsx</button>
          <button className="btn" onClick={() => setEditing('new')} disabled={!cols.length} title={cols.length ? '' : 'Upload a file first to define the columns'}>+ Add</button>
          <a className="btn" href={api.exportUrl(master.type)}>Download .xlsx</a>
          {cols.length > 0 && <a className="btn ghost" href={api.templateUrl(master.type)}>Template</a>}
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}

      <div className="toolbar">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${cols.map((c) => c.label).slice(0, 3).join(', ') || 'records'}…`} />
        <span className="count">{query ? `${fmt(data.total)} match${data.total === 1 ? '' : 'es'}` : `${fmt(data.total)} records`}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {cols.map((c, i) => <th key={c.key} className={i === 0 ? 'c-code' : ''}>{c.label}</th>)}
              <th className="c-upd">Updated</th>
              <th className="c-act" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                {cols.map((c, i) => (
                  <td key={c.key} className={i === 0 ? 'c-code mono' : ''}>
                    {r[c.key] || <span className="blank">—</span>}
                  </td>
                ))}
                <td className="c-upd">{r.updated_at}</td>
                <td className="c-act">
                  <button className="link" onClick={() => setEditing(r)}>Edit</button>
                  <button className="link danger" onClick={() => setDeleting(r)}>Delete</button>
                </td>
              </tr>
            ))}
            {!data.rows.length && (
              <tr><td colSpan={cols.length + 2} className="empty">
                {!cols.length ? 'No columns defined yet. Upload an Excel file; its header row sets the columns.' : query ? `No matches for “${query}”` : 'No records'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Prev</button>
        <span>Page {page} of {pages}</span>
        <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next ›</button>
        <select value={size} onChange={(e) => { setSize(+e.target.value); setPage(1); }} aria-label="Rows per page">
          {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      <details className="history">
        <summary>Upload history</summary>
        <div className="table-wrap">
          <table className="mini">
            <thead><tr><th>When</th><th>File</th><th>Sheet</th><th>Mode</th><th>New</th><th>Updated</th><th>Unchanged</th><th>Dup. skipped</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}><td>{l.created_at}</td><td>{l.file_name}</td><td>{l.sheet_name}</td><td>{l.mode}</td>
                  <td>{fmt(l.inserted)}</td><td>{fmt(l.updated)}</td><td>{fmt(l.unchanged)}</td><td>{fmt(l.skipped)}</td></tr>
              ))}
              {!logs.length && <tr><td colSpan={8} className="empty">No uploads yet</td></tr>}
            </tbody>
          </table>
        </div>
      </details>

      {editing && (
        <EditDialog master={master} row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
      )}
      {uploadOpen && <UploadDialog master={master} onClose={() => setUploadOpen(false)} onDone={onChanged} />}
      {deleting && (
        <Modal title="Delete record" onClose={() => setDeleting(null)}
          footer={<><button className="btn" onClick={() => setDeleting(null)}>Cancel</button><button className="btn danger" onClick={confirmDelete}>Delete</button></>}>
          <p>Delete <b>{cols.map((c) => deleting[c.key]).filter(Boolean).join(' · ')}</b>?</p>
        </Modal>
      )}
    </section>
  );
}

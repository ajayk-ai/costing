import { useEffect, useState } from 'react';
import { api, fmt } from '../../api.js';
import PageHeader from '../../ui/PageHeader.jsx';
import Tabs from '../../ui/Tabs.jsx';
import Card from '../../ui/Card.jsx';
import Button from '../../ui/Button.jsx';
import Alert from '../../ui/Alert.jsx';
import SearchInput from '../../ui/SearchInput.jsx';
import Pagination from '../../ui/Pagination.jsx';
import ConfirmDialog from '../../ui/ConfirmDialog.jsx';
import { useToast } from '../../ui/Toast.jsx';
import MasterTable from './MasterTable.jsx';
import EditDialog from './EditDialog.jsx';
import MasterUpload from './MasterUpload.jsx';
import MasterHistory from './MasterHistory.jsx';

const TABS = ['records', 'upload', 'history'];

export default function MasterPage({ master, tab: asked, onTab: setTab, version, onChanged }) {
  const tab = TABS.includes(asked) ? asked : 'records';
  const toast = useToast();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState(''); // debounced q
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [deleting, setDeleting] = useState(null);
  const cols = master.columns;

  useEffect(() => {
    const t = setTimeout(() => { setQuery(q); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.rows(master.type, { q: query, page, size })
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [master.type, query, page, size, version]);

  const loadLogs = () => api.logs(master.type).then(setLogs).catch(() => {});
  useEffect(() => { loadLogs(); }, [master.type, version]);

  async function confirmDelete() {
    try {
      await api.remove(master.type, deleting.id);
      toast('Record deleted');
      onChanged();
    } catch (e) { setError(e.message); }
    setDeleting(null);
  }

  const description = master.count
    ? `${fmt(master.count)} records · last updated ${master.lastUpdated}${master.keyed ? '' : ' · mapping table: a code may appear more than once'}`
    : 'No records yet. Upload an Excel file to start.';

  const tabs = [
    { id: 'records', label: 'Records', count: master.count },
    { id: 'upload', label: 'Upload' },
    { id: 'history', label: 'History', count: logs.length },
  ];

  return (
    <>
      <PageHeader eyebrow={master.group} title={master.label} description={description}
        actions={<>
          <Button icon="plus" onClick={() => setEditing('new')} disabled={!cols.length}
            title={cols.length ? 'Add one record' : 'Upload a file first to define the columns'}>Add record</Button>
          <Button icon="download" href={api.exportUrl(master.type)}>Download .xlsx</Button>
        </>} />
      <div className="page-tabs"><Tabs tabs={tabs} value={tab} onChange={setTab} label={master.label} /></div>

      {error && <Alert tone="error" onClose={() => setError('')}>{error}</Alert>}

      {tab === 'records' && (
        <Card flush>
          <div className="table-toolbar">
            <SearchInput value={q} onChange={setQ} placeholder={`Search ${cols.map((c) => c.label).slice(0, 3).join(', ') || 'records'}`} />
            <span className="count">{query ? `${fmt(data.total)} match${data.total === 1 ? '' : 'es'}` : `${fmt(data.total)} records`}</span>
          </div>
          <MasterTable master={master} rows={data.rows} loading={loading} query={query}
            onEdit={setEditing} onDelete={setDeleting} onUpload={() => setTab('upload')} />
          {data.total > 0 && (
            <Pagination page={page} size={size} total={data.total} onPage={setPage} onSize={(n) => { setSize(n); setPage(1); }} />
          )}
        </Card>
      )}
      {tab === 'upload' && <MasterUpload master={master} onDone={onChanged} onViewRecords={() => setTab('records')} />}
      {tab === 'history' && <MasterHistory type={master.type} logs={logs} onChanged={loadLogs} />}

      {editing && (
        <EditDialog master={master} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={() => { toast(editing === 'new' ? 'Record added' : 'Changes saved'); setEditing(null); onChanged(); }} />
      )}
      {deleting && (
        <ConfirmDialog title="Delete record" onClose={() => setDeleting(null)} onConfirm={confirmDelete}>
          <p>Delete <b>{cols.map((c) => deleting[c.key]).filter(Boolean).join(' · ')}</b>? This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </>
  );
}

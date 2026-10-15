import { api, fmt } from '../../api.js';
import HistoryManager from '../../ui/HistoryManager.jsx';
import Icon from '../../ui/Icon.jsx';
import { IconButton } from '../../ui/Button.jsx';

// Rounded down, so a run with blank rows never shows 100%.
const pct = (r) => (r.rows ? Math.floor((r.filled / r.rows) * 1000) / 10 : 0);

const COLUMNS = [
  { label: 'File', render: (r) => <span className="file-cell"><Icon name="sheet" />{r.file_name}</span> },
  { label: 'Processed', className: 'c-date', render: (r) => r.created_at },
  { label: 'Rows', className: 'num', render: (r) => fmt(r.rows) },
  {
    label: 'Department filled', className: 'c-fill',
    render: (r) => (
      <span className="run-fill">
        <span className="meter"><i style={{ width: `${pct(r)}%` }} /></span>
        <span className={r.unfilled ? 'warn-text' : 'ok-text'}>{pct(r)}%</span>
      </span>
    ),
  },
  { label: 'Blank', className: 'num', render: (r) => (r.unfilled ? <span className="warn-text">{fmt(r.unfilled)}</span> : '0') },
];

export default function SapHistory({ runs, activeId, onView, onDeleted }) {
  return (
    <HistoryManager title="Processed files" items={runs} columns={COLUMNS} activeId={activeId} noun={['run', 'runs']}
      searchText={(r) => r.file_name || ''}
      note="Deleting a run also deletes its result file. Masters are not changed."
      emptyText="Files you process appear here, ready to open or download again."
      rowActions={(r) => <>
        <IconButton icon="eye" label="Open result" onClick={() => onView(r.id)} />
        <a className="icon-btn" href={api.sapDownloadUrl(r.id)} aria-label="Download result .xlsx" title="Download result .xlsx"><Icon name="download" /></a>
      </>}
      onDelete={async (ids) => { await Promise.all(ids.map(api.deleteSapRun)); onDeleted(ids); }}
      onClear={async () => { await api.clearSapRuns(); onDeleted('all'); }} />
  );
}

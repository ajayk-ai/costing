import { api, fmt } from '../../api.js';
import HistoryManager from '../../ui/HistoryManager.jsx';
import Icon from '../../ui/Icon.jsx';

const COLUMNS = [
  { label: 'When', className: 'c-date', render: (l) => l.created_at },
  { label: 'File', render: (l) => <span className="file-cell"><Icon name="sheet" />{l.file_name}</span> },
  { label: 'Sheet', render: (l) => l.sheet_name },
  { label: 'Mode', render: (l) => <span className={`pill ${l.mode}`}>{l.mode}</span> },
  { label: 'New', className: 'num', render: (l) => fmt(l.inserted) },
  { label: 'Updated', className: 'num', render: (l) => fmt(l.updated) },
  { label: 'Unchanged', className: 'num', render: (l) => fmt(l.unchanged) },
  { label: 'Dup. skipped', className: 'num', render: (l) => fmt(l.skipped) },
];

export default function MasterHistory({ type, logs, onChanged }) {
  return (
    <HistoryManager title="Upload history" items={logs} columns={COLUMNS} noun={['entry', 'entries']}
      searchText={(l) => `${l.file_name} ${l.sheet_name}`}
      note="Deleting history only removes these log entries. The master's records stay as they are."
      emptyText="Each upload to this master is logged here."
      onDelete={async (ids) => { await Promise.all(ids.map((id) => api.deleteLog(type, id))); onChanged(); }}
      onClear={async () => { await api.clearLogs(type); onChanged(); }} />
  );
}

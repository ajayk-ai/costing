import { useState } from 'react';
import { fmt } from '../api.js';
import Card from './Card.jsx';
import Button, { IconButton } from './Button.jsx';
import Checkbox from './Checkbox.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import EmptyState from './EmptyState.jsx';
import SearchInput from './SearchInput.jsx';
import { useToast } from './Toast.jsx';
import { useSelection } from './selection.js';

/*
  A history list with search, checkboxes, "Delete selected", "Clear all" and per-row delete,
  each behind a confirmation.

  items        rows, each with an `id`
  columns      [{ label, className?, render(item) }]
  searchText   item -> text the search box matches
  rowActions   item -> extra buttons shown before the delete button
  onDelete     async (ids) => void      deletes the given entries
  onClear      async () => void         deletes everything
  noun         ['run', 'runs']           used in buttons and messages
  note         text under the toolbar (what deleting does and does not affect)
*/
export default function HistoryManager({ title, icon = 'clock', items, columns, searchText, rowActions, onDelete, onClear,
  noun = ['entry', 'entries'], note, activeId, emptyText }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(null); // { ids } | { all: true }
  const [busy, setBusy] = useState(false);

  const shown = q ? items.filter((it) => searchText(it).toLowerCase().includes(q.toLowerCase())) : items;
  const sel = useSelection(shown.map((it) => it.id));
  const plural = (n) => `${fmt(n)} ${n === 1 ? noun[0] : noun[1]}`;

  async function run() {
    setBusy(true);
    try {
      if (confirm.all) { await onClear(); toast(`History cleared`); }
      else { await onDelete(confirm.ids); toast(`Deleted ${plural(confirm.ids.length)}`); }
      sel.clear();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
    setConfirm(null);
  }

  const n = sel.selected.size;
  return (
    <Card title={title} icon={icon} flush
      actions={<Button variant="danger-outline" icon="trash" disabled={!items.length} onClick={() => setConfirm({ all: true })}>Clear all</Button>}>
      <div className="table-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search by file name" />
        {n > 0 ? (
          <div className="bulk">
            <span>{fmt(n)} selected</span>
            <Button size="sm" variant="danger" icon="trash" onClick={() => setConfirm({ ids: [...sel.selected] })}>Delete selected</Button>
            <Button size="sm" variant="ghost" onClick={sel.clear}>Cancel</Button>
          </div>
        ) : (
          <span className="count">{q ? `${fmt(shown.length)} of ${plural(items.length)}` : plural(items.length)}</span>
        )}
      </div>
      {note && <p className="hint table-note">{note}</p>}

      {shown.length ? (
        <div className="table-wrap flat">
          <table>
            <thead>
              <tr>
                <th className="c-check"><Checkbox checked={sel.all} indeterminate={sel.some} onChange={sel.toggleAll} label="Select all" /></th>
                {columns.map((c) => <th key={c.label} className={c.className}>{c.label}</th>)}
                <th className="c-act"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((it) => (
                <tr key={it.id} className={`${sel.has(it.id) ? 'selected' : ''}${it.id === activeId ? ' current' : ''}`}>
                  <td className="c-check"><Checkbox checked={sel.has(it.id)} onChange={() => sel.toggle(it.id)} label="Select" /></td>
                  {columns.map((c) => <td key={c.label} className={c.className}>{c.render(it)}</td>)}
                  <td className="c-act">
                    {rowActions?.(it)}
                    <IconButton icon="trash" label="Delete" className="danger" onClick={() => setConfirm({ ids: [it.id] })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={q ? 'search' : icon} title={q ? `No matches for “${q}”` : 'No history yet'}>{q ? null : emptyText}</EmptyState>
      )}

      {confirm && (
        <ConfirmDialog busy={busy} onClose={() => setConfirm(null)} onConfirm={run}
          title={confirm.all ? 'Clear all history' : `Delete ${plural(confirm.ids.length)}`}
          confirmLabel={confirm.all ? 'Clear all' : 'Delete'}>
          <p>{confirm.all ? `Delete all ${plural(items.length)}?` : `Delete ${plural(confirm.ids.length)}?`} This cannot be undone.</p>
          {note && <p className="hint">{note}</p>}
        </ConfirmDialog>
      )}
    </Card>
  );
}

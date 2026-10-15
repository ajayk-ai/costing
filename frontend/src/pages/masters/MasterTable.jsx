import Button, { IconButton } from '../../ui/Button.jsx';
import EmptyState from '../../ui/EmptyState.jsx';

export default function MasterTable({ master, rows, loading, query, onEdit, onDelete, onUpload }) {
  const cols = master.columns;

  let empty = null;
  if (!rows.length && !loading) {
    empty = !cols.length
      ? <EmptyState icon="upload" title="No columns yet" action={<Button variant="primary" icon="upload" onClick={onUpload}>Upload .xlsx</Button>}>
          Upload an Excel file; its header row sets the columns.
        </EmptyState>
      : query
        ? <EmptyState icon="search" title={`No matches for “${query}”`}>Try a shorter code or a different word.</EmptyState>
        : <EmptyState icon="database" title="No records" action={<Button variant="primary" icon="upload" onClick={onUpload}>Upload .xlsx</Button>}>
            Upload an Excel file or add records one by one.
          </EmptyState>;
  }

  return (
    <div className={`table-wrap flat${loading ? ' loading' : ''}`}>
      <table>
        <thead>
          <tr>
            {cols.map((c, i) => <th key={c.key} className={i === 0 ? 'c-code' : ''}>{c.label}</th>)}
            <th className="c-upd">Updated</th>
            <th className="c-act"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {cols.map((c, i) => (
                <td key={c.key} className={i === 0 ? 'c-code mono' : ''}>{r[c.key] || <span className="blank">—</span>}</td>
              ))}
              <td className="c-upd">{r.updated_at}</td>
              <td className="c-act">
                <IconButton icon="edit" label="Edit" onClick={() => onEdit(r)} />
                <IconButton icon="trash" label="Delete" className="danger" onClick={() => onDelete(r)} />
              </td>
            </tr>
          ))}
          {empty && <tr className="no-hover"><td colSpan={cols.length + 2}>{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

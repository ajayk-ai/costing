import { useState } from 'react';
import Tabs from '../../ui/Tabs.jsx';
import EmptyState from '../../ui/EmptyState.jsx';
import { ADDED, colLetter } from './columns.js';

export default function PreviewTable({ header, preview, unfilled }) {
  const [which, setWhich] = useState(unfilled ? 'unfilled' : 'all');
  const rows = preview[which] || [];
  return (
    <>
      <div className="preview-head">
        <p className="hint">Up to 100 rows. Download the file for everything.</p>
        <Tabs variant="seg" value={which} onChange={setWhich} label="Rows to preview"
          tabs={[{ id: 'all', label: 'First rows' }, { id: 'unfilled', label: 'Department blank', count: unfilled }]} />
      </div>
      {rows.length ? (
        <div className="table-wrap preview">
          <table>
            <thead>
              <tr>{header.map((h, i) => <th key={i} className={ADDED.has(h) ? 'added' : ''}><span className="col-letter">{colLetter(i)}</span>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{r.map((v, j) => <td key={j} className={ADDED.has(header[j]) ? 'added' : ''}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="check" title="Nothing to show">{which === 'unfilled' ? 'Every row has a department.' : 'The file has no data rows.'}</EmptyState>
      )}
    </>
  );
}

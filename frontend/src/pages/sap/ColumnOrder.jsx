import { ADDED, colLetter } from './columns.js';

export default function ColumnOrder({ header }) {
  return (
    <>
      <p className="hint">
        The result file has these {header.length} columns, in this order.
        <span className="legend"><i className="swatch added" /> added by the mapping</span>
        <span className="legend"><i className="swatch" /> copied from the SAP file</span>
      </p>
      <ol className="col-order">
        {header.map((h, i) => (
          <li key={i} className={ADDED.has(h) ? 'added' : ''}><b>{colLetter(i)}</b>{h}</li>
        ))}
      </ol>
    </>
  );
}

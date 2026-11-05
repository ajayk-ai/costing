import { useState } from 'react';
import Tabs from '../../ui/Tabs.jsx';
import EmptyState from '../../ui/EmptyState.jsx';
import { ADDED, AI_FLAG, FLAG_LABEL, colLetter } from './columns.js';

const EMPTY = {
  unfilled: 'Every row has a department.',
  review: 'The AI found no confident disagreement in the first rows.',
  watch: 'No weaker disagreements to watch.',
  all: 'The file has no data rows.',
};

// ai: summary.ai (null when the AI check was not run). Rows are tinted by their AI Flag.
export default function PreviewTable({ header, preview, unfilled, ai }) {
  const hasAi = !!(ai && ai.enabled && preview.review);
  const [which, setWhich] = useState(unfilled ? 'unfilled' : hasAi && ai.counts.REVIEW ? 'review' : 'all');
  const rows = preview[which] || [];
  const flagCol = header.indexOf(AI_FLAG);
  const tabs = [
    { id: 'all', label: 'First rows' },
    { id: 'unfilled', label: 'Department blank', count: unfilled },
    ...(hasAi ? [
      { id: 'review', label: 'AI Review', count: ai.counts.REVIEW, tone: 'danger' },
      { id: 'watch', label: 'AI Watch', count: ai.counts.WATCH, tone: 'warn' },
    ] : []),
  ];
  return (
    <>
      <div className="preview-head">
        <p className="hint">
          Up to 100 rows. Download the file for everything.
        </p>
        <Tabs variant="seg" value={which} onChange={setWhich} label="Rows to preview" tabs={tabs} />
      </div>
      {rows.length ? (
        <div className="table-wrap preview">
          <table>
            <thead>
              <tr>{header.map((h, i) => <th key={i} className={ADDED.has(h) ? 'added' : ''}><span className="col-letter">{colLetter(i)}</span>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={flagCol >= 0 && r[flagCol] ? `flag-${r[flagCol]}` : ''}>
                  {r.map((v, j) => (
                    <td key={j} className={ADDED.has(header[j]) ? 'added' : ''}>
                      {j === flagCol && v ? <span className={`flag ${v}`}>{FLAG_LABEL[v] || v}</span> : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="check" title="Nothing to show">{EMPTY[which]}</EmptyState>
      )}
    </>
  );
}

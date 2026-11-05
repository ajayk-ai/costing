import { fmt } from '../../api.js';
import { FLAG_LABEL } from './columns.js';

const ORDER = ['REVIEW', 'WATCH', 'NO_DEPT', 'OK'];
const MEANING = {
  REVIEW: 'The AI disagrees with the Department and is confident. Check these first.',
  WATCH: 'A weaker disagreement, or this Cost Ctr + Account was never booked to this department before.',
  NO_DEPT: 'The line has no Department. The AI suggestion is shown in its column.',
  OK: 'The AI agrees with the Department.',
};

// Summary of the AI department check for one run.
export default function AiCheck({ ai, rows }) {
  const m = ai.model || {};
  const pct = (n) => `${rows ? ((n / rows) * 100).toFixed(1) : '0.0'}%`;
  return (
    <>
      <p className="hint">
        The AI suggests a department from the vendor, account, account description and order description only, never the cost center.
        The Department column (D1 rules) is not changed. Many differences are systematic rules rather than mistakes: agree with finance which are real.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>AI Flag</th><th className="num">Rows</th><th className="num">% of rows</th><th>Meaning</th></tr></thead>
          <tbody>
            {ORDER.map((f) => (
              <tr key={f}>
                <td><span className={`flag ${f}`}>{FLAG_LABEL[f]}</span></td>
                <td className="num">{fmt(ai.counts[f] || 0)}</td>
                <td className="num">{pct(ai.counts[f] || 0)}</td>
                <td>{MEANING[f]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Review needs a confidence of {Math.round(ai.reviewConf * 100)}% or more, Watch from {Math.round(ai.watchConf * 100)}%.
        {m.trainedOn && <> Model trained {m.trainedOn.replace('T', ' ')} on {fmt(m.lines)} lines{m.accuracy ? `, ${(m.accuracy * 100).toFixed(1)}% accurate on held-out data` : ''}.</>}
      </p>

      {ai.pairs.length > 0 && (
        <>
          <h4 className="sub-head">Most common Review corrections</h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Department now</th><th>AI suggests</th><th className="num">Rows</th></tr></thead>
              <tbody>
                {ai.pairs.map((p) => (
                  <tr key={`${p.assigned}>${p.suggested}`}><td>{p.assigned}</td><td>{p.suggested}</td><td className="num">{fmt(p.rows)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h4 className="sub-head">By department</h4>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Department</th><th className="num">Rows</th><th className="num">Review</th><th className="num">Watch</th></tr></thead>
          <tbody>
            {ai.byDept.map((d) => (
              <tr key={d.department}>
                <td>{d.department}</td><td className="num">{fmt(d.rows)}</td>
                <td className="num">{d.review ? <b className="danger-text">{fmt(d.review)}</b> : 0}</td>
                <td className="num">{d.watch ? <span className="warn-text">{fmt(d.watch)}</span> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

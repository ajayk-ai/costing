import { fmt } from '../../api.js';

export default function RuleSteps({ summary: s, onOpenMaster }) {
  return (
    <>
      <p className="hint">The D1 rules run in this order. Each step only looks at rows that are still blank after the steps above it.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>D1 master</th><th>Matched on</th><th className="num">Master codes</th><th className="num">Rows filled</th><th className="c-share">Share of rows</th><th className="num">Still blank</th></tr>
          </thead>
          <tbody>
            {s.steps.map((st, i) => (
              <tr key={st.master} className={st.skipped ? 'muted' : ''}>
                <td><span className="step-no">{i + 1}</span></td>
                <td>
                  <button type="button" className="link" onClick={() => onOpenMaster(st.master)}>{st.label}</button>
                  {st.skipped && <span className="tag">no data, skipped</span>}
                </td>
                <td>{st.matchOn}</td>
                <td className="num">{fmt(st.masterRows)}</td>
                <td className="num"><b>{fmt(st.filled)}</b></td>
                <td className="c-share"><span className="meter"><i style={{ width: `${s.rows ? (st.filled / s.rows) * 100 : 0}%` }} /></span></td>
                <td className="num">{fmt(st.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {s.unmatchedAccounts.length > 0 && (
        <div className="subsection">
          <h3>Accounts with no department <span className="muted">({fmt(s.unfilled)} rows)</span></h3>
          <p className="hint">Add these accounts to a D1 master and process the file again.</p>
          <div className="chips">
            {s.unmatchedAccounts.map((a) => (
              <span className="chip" key={a.account}>{a.account}{a.description && <span className="muted"> · {a.description}</span>} <b>{fmt(a.rows)}</b></span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

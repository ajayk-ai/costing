import { fmt } from '../../api.js';

export default function DescriptionTable({ descriptions, onOpenMaster }) {
  return (
    <>
      <p className="hint">Each added column is looked up in its master by the SAP code. Codes not in the master are listed so they can be added.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Added column</th><th>Looked up by</th><th className="num">Found</th><th className="num">Key blank</th><th>Code not in master</th></tr>
          </thead>
          <tbody>
            {descriptions.map((d) => (
              <tr key={d.column}>
                <td><b>{d.column}</b></td>
                <td>{d.present ? d.keyColumn : <span className="warn-text">{d.keyColumn} column not in file</span>}</td>
                <td className="num">{fmt(d.matched)}</td>
                <td className="num">{fmt(d.blank)}</td>
                <td>
                  {d.missingRows ? (
                    <details className="inline">
                      <summary><span className="warn-text">{fmt(d.missingRows)} rows · {fmt(d.missingCodeCount)} codes</span></summary>
                      <div className="chips">
                        {d.missingCodes.map((c) => <span className="chip" key={c.code}>{c.code} <b>{fmt(c.rows)}</b></span>)}
                        {d.missingCodeCount > d.missingCodes.length && <span className="chip muted">+{fmt(d.missingCodeCount - d.missingCodes.length)} more</span>}
                      </div>
                      <button type="button" className="link" onClick={() => onOpenMaster(d.master)}>Open {d.label} →</button>
                    </details>
                  ) : <span className="ok-text">all found</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

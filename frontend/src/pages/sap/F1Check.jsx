import { fmt } from '../../api.js';

// F1 mapping of one run: how GL Nature and Overhead were filled, and what to add to the F1 masters.
export default function F1Check({ f1, rows }) {
  const g = f1.glNature, o = f1.overhead;
  const pct = (n) => `${rows ? ((n / rows) * 100).toFixed(1) : '0.0'}%`;
  const line = (label, n, note) => (
    <tr key={label}><td>{label}</td><td className="num">{fmt(n)}</td><td className="num">{pct(n)}</td><td>{note}</td></tr>
  );
  return (
    <>
      <p className="hint">
        GL Nature comes from the Account (F1 GL Nature master). Overhead comes from the account description in that master plus the
        Department, looked up in the F1 Overhead master. A line that cannot be matched keeps a blank cell.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Column</th><th className="num">Rows</th><th className="num">% of rows</th><th>Meaning</th></tr></thead>
          <tbody>
            {line('GL Nature filled', g.matched, 'Account found in F1 GL Nature')}
            {line('GL Nature: account not in master', g.missingRows, 'Add the account to F1 GL Nature')}
            {line('GL Nature: blank account', g.blank, 'The SAP line has no account')}
            {line('Overhead filled', o.matched, 'GL description + Department found in F1 Overhead')}
            {line('Overhead: no department', o.noDepartment, 'No Department, so no key can be built')}
            {line('Overhead: account not in F1 GL Nature', o.noGlAccount, 'No GL description, so no key can be built')}
            {line('Overhead: combination missing', o.missingRows, 'Add the combination to F1 Overhead (list below)')}
          </tbody>
        </table>
      </div>

      {o.missing.length > 0 && (
        <>
          <h4 className="sub-head">Add to F1 Overhead ({fmt(o.missingKeyCount)} combinations)</h4>
          <p className="hint">
            The key is the GL description and the Department written together. Add each one with its Overhead value
            {o.missingKeyCount > o.missing.length ? `. The ${fmt(o.missing.length)} biggest are shown here.` : '.'} The Summary sheet of the download has the same list.
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>GL description</th><th>Department</th><th>Key (GL + Department)</th><th className="num">Rows</th></tr></thead>
              <tbody>
                {o.missing.map((m) => (
                  <tr key={m.key}><td>{m.description}</td><td>{m.department}</td><td>{m.key}</td><td className="num">{fmt(m.rows)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {g.missing.length > 0 && (
        <>
          <h4 className="sub-head">Accounts missing from F1 GL Nature</h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Account</th><th className="num">Rows</th></tr></thead>
              <tbody>{g.missing.map((m) => <tr key={m.account}><td>{m.account}</td><td className="num">{fmt(m.rows)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

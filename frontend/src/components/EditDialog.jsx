import { useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

export default function EditDialog({ master, row, onClose, onSaved }) {
  const cols = master.columns;
  const [values, setValues] = useState(() => Object.fromEntries(cols.map((c) => [c.key, row?.[c.key] ?? ''])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      if (row) await api.update(master.type, row.id, values);
      else await api.add(master.type, values);
      onSaved();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <Modal title={`${row ? 'Edit' : 'Add'} · ${master.label}`} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary" disabled={busy}>Save</button></>}>
      {cols.map((c, i) => {
        const locked = master.keyed && i === 0 && !!row; // a code is not renamed; delete and re-add instead
        return (
          <label className="field" key={c.key}>
            <span>{c.label}{master.keyed && i === 0 && ' *'}</span>
            <input value={values[c.key]} readOnly={locked} autoFocus={locked ? false : i === (row && master.keyed ? 1 : 0)}
              required={master.keyed && i === 0}
              onChange={(e) => setValues({ ...values, [c.key]: e.target.value })} />
          </label>
        );
      })}
      {error && <div className="result error">{error}</div>}
    </Modal>
  );
}

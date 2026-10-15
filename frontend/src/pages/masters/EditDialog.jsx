import { useState } from 'react';
import { api } from '../../api.js';
import Button from '../../ui/Button.jsx';
import Modal from '../../ui/Modal.jsx';
import Alert from '../../ui/Alert.jsx';

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
    <Modal title={`${row ? 'Edit' : 'Add'} record · ${master.label}`} onClose={onClose} onSubmit={save}
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{row ? 'Save changes' : 'Add record'}</Button></>}>
      {cols.map((c, i) => {
        const key = master.keyed && i === 0;
        const locked = key && !!row; // a code is not renamed; delete and re-add instead
        return (
          <label className="field" key={c.key}>
            <span>{c.label}{key && <em className="req"> *</em>}</span>
            <input value={values[c.key]} readOnly={locked} required={key}
              autoFocus={locked ? false : i === (row && master.keyed ? 1 : 0)}
              onChange={(e) => setValues({ ...values, [c.key]: e.target.value })} />
            {locked && <small>The code can't be changed. Delete the record and add it again instead.</small>}
          </label>
        );
      })}
      {error && <Alert tone="error">{error}</Alert>}
    </Modal>
  );
}

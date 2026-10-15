import { useState } from 'react';
import Button from '../../ui/Button.jsx';
import Modal from '../../ui/Modal.jsx';
import UploadForm from './UploadForm.jsx';

// Full expense-report workbook upload (top bar): every master tab found is updated.
export default function UploadDialog({ onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const close = busy ? () => {} : onClose;
  return (
    <Modal title="Upload full workbook" onClose={close} footer={<Button onClick={close} disabled={busy}>Close</Button>}>
      <p className="hint">Select the Departmentwise Expense Report workbook. Every master tab found in it is updated; empty tabs are skipped.</p>
      <UploadForm workbook onDone={onDone} onBusy={setBusy} />
    </Modal>
  );
}

import Button from './Button.jsx';
import Modal from './Modal.jsx';

export default function ConfirmDialog({ title, children, confirmLabel = 'Delete', variant = 'danger', busy, onConfirm, onClose }) {
  return (
    <Modal title={title} size="sm" onClose={onClose} onSubmit={onConfirm}
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" variant={variant} disabled={busy}>{confirmLabel}</Button></>}>
      {children}
    </Modal>
  );
}

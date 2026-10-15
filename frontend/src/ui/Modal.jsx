import { useEffect, useRef } from 'react';
import { IconButton } from './Button.jsx';

// Native <dialog> shown modally; Esc, the close button and backdrop clicks call onClose.
export default function Modal({ title, children, footer, onClose, onSubmit, size }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const d = ref.current;
    if (!d.open) d.showModal();
    const cancel = (e) => { e.preventDefault(); closeRef.current(); };
    d.addEventListener('cancel', cancel);
    return () => d.removeEventListener('cancel', cancel);
  }, []);

  return (
    <dialog ref={ref} className={size ? `dlg-${size}` : ''} onMouseDown={(e) => e.target === ref.current && onClose()}>
      <form className="dlg" onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
        <header className="dlg-head">
          <h2>{title}</h2>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </header>
        <div className="dlg-body">{children}</div>
        {footer && <footer className="dlg-foot">{footer}</footer>}
      </form>
    </dialog>
  );
}

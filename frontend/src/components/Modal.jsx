import { useEffect, useRef } from 'react';

// Native <dialog> shown modally; Esc and backdrop clicks close it.
export default function Modal({ title, children, footer, onClose, onSubmit }) {
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
    <dialog ref={ref} onMouseDown={(e) => e.target === ref.current && onClose()}>
      <form className="dlg" onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
        <h2>{title}</h2>
        {children}
        <div className="dlg-actions">{footer}</div>
      </form>
    </dialog>
  );
}

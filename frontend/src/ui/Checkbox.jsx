import { useEffect, useRef } from 'react';

export default function Checkbox({ checked, indeterminate = false, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="check" checked={checked} onChange={onChange} aria-label={label} />;
}

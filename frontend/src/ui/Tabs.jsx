import { fmt } from '../api.js';

// tabs: [{ id, label, count?, tone? }]. variant "seg" draws a compact segmented control.
export default function Tabs({ tabs, value, onChange, variant = 'line', label }) {
  return (
    <div className={variant === 'seg' ? 'seg' : 'tabs'} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className="tab" onClick={() => onChange(t.id)}>
          {t.label}
          {t.count != null && <span className={`tab-count${t.tone ? ` ${t.tone}` : ''}`}>{fmt(t.count)}</span>}
        </button>
      ))}
    </div>
  );
}

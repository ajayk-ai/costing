// tone: ok | warn. `progress` (0-100) draws a bar under the value.
export default function StatCard({ label, value, hint, tone, progress }) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <b className="stat-value">{value}</b>
      {progress != null && <div className="meter"><i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>}
      {hint && <small className="stat-hint">{hint}</small>}
    </div>
  );
}

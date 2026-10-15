import Icon from './Icon.jsx';

export default function EmptyState({ icon = 'sheet', title, children, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={22} /></span>
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

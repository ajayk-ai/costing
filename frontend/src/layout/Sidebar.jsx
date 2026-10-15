import { fmt } from '../api.js';
import Icon from '../ui/Icon.jsx';

const GROUP_ICONS = { 'Description Masters': 'list', 'D1 Department Mapping': 'branch' };

function NavItem({ icon, label, count, active, onClick }) {
  return (
    <button type="button" className="nav-item" aria-current={active ? 'page' : undefined} onClick={onClick}>
      {icon && <Icon name={icon} />}
      <span className="nav-label">{label}</span>
      {count != null && (
        <span className={`badge${count ? '' : ' zero'}`} title={count ? `${fmt(count)} records` : 'No records yet'}>{fmt(count)}</span>
      )}
    </button>
  );
}

// Main navigation: the SAP page, then every master by group. On small screens it slides in as a drawer.
export default function Sidebar({ masters, view, sapView, onNavigate, open, onClose }) {
  const groups = [...new Set(masters.map((m) => m.group))];
  return (
    <>
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <nav aria-label="Main">
          <div className="nav-group">
            <div className="nav-title">Processing</div>
            <NavItem icon="shuffle" label="SAP Data Mapping" active={view === sapView} onClick={() => onNavigate(sapView)} />
          </div>
          {groups.map((g) => (
            <div className="nav-group" key={g}>
              <div className="nav-title"><Icon name={GROUP_ICONS[g] || 'database'} size={13} />{g}</div>
              {masters.filter((m) => m.group === g).map((m) => (
                <NavItem key={m.type} label={m.label} count={m.count} active={m.type === view} onClick={() => onNavigate(m.type)} />
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="scrim" onClick={onClose} aria-hidden="true" />}
    </>
  );
}

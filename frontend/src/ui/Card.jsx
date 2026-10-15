import Icon from './Icon.jsx';

// A white panel with an optional header (icon, title, subtitle, actions).
// `flush` removes the body padding, for tables that run edge to edge.
export default function Card({ title, icon, subtitle, actions, children, className = '', flush }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div className="card-title">
            {icon && <span className="card-icon"><Icon name={icon} /></span>}
            <div>
              {title && <h2>{title}</h2>}
              {subtitle && <p className="card-sub">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={`card-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

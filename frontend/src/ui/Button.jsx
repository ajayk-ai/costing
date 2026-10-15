import Icon from './Icon.jsx';

// variant: primary | danger | ghost | on-dark; size: sm. Renders a link when `href` is given.
export default function Button({ variant, size, icon, href, children, className = '', ...rest }) {
  const cls = ['btn', variant, size, !children && 'icon-only', className].filter(Boolean).join(' ');
  const body = <>{icon && <Icon name={icon} />}{children}</>;
  return href
    ? <a className={cls} href={href} {...rest}>{body}</a>
    : <button type="button" className={cls} {...rest}>{body}</button>;
}

export function IconButton({ icon, label, className = '', ...rest }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

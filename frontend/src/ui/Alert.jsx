import Icon from './Icon.jsx';
import { IconButton } from './Button.jsx';

const ICONS = { error: 'alert', warn: 'alert', success: 'check', info: 'info' };

// tone: info | success | warn | error
export default function Alert({ tone = 'info', title, children, onClose }) {
  return (
    <div className={`alert ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={ICONS[tone]} />
      <div className="alert-body">
        {title && <b>{title}</b>}
        {children && <div className="alert-text">{children}</div>}
      </div>
      {onClose && <IconButton icon="x" label="Dismiss" onClick={onClose} />}
    </div>
  );
}

import Icon from './Icon.jsx';
import { IconButton } from './Button.jsx';

export default function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="search">
      <Icon name="search" />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')} />
      {value && <IconButton icon="x" label="Clear search" onClick={() => onChange('')} />}
    </div>
  );
}

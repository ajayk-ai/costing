import { fmt } from '../api.js';
import Button from './Button.jsx';

export default function Pagination({ page, size, total, onPage, onSize, sizes = [25, 50, 100, 250] }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (page - 1) * size + 1 : 0;
  const to = Math.min(total, page * size);
  return (
    <div className="pager">
      <span>{fmt(from)}–{fmt(to)} of {fmt(total)}</span>
      <label className="pager-size">
        Rows per page
        <select value={size} onChange={(e) => onSize(+e.target.value)}>
          {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div className="pager-nav">
        <Button size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" />
        <span>Page {fmt(page)} of {fmt(pages)}</span>
        <Button size="sm" icon="chevronRight" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" />
      </div>
    </div>
  );
}

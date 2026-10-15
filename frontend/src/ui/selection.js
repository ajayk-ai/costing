import { useState } from 'react';

// Checkbox selection over a list of ids. Ids that disappear (deleted, filtered out) drop out of the selection.
export function useSelection(ids) {
  const [picked, setPicked] = useState(() => new Set());
  const selected = new Set(ids.filter((id) => picked.has(id)));
  const all = ids.length > 0 && selected.size === ids.length;
  return {
    selected,
    all,
    some: selected.size > 0 && !all,
    has: (id) => selected.has(id),
    toggle: (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }),
    toggleAll: () => setPicked(all ? new Set() : new Set(ids)),
    clear: () => setPicked(new Set()),
  };
}

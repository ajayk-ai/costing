// Frontend for the master data tabs.
const $ = (id) => document.getElementById(id);
const state = { masters: [], type: null, page: 1, size: 50, q: '', total: 0, editing: null, uploadTarget: null };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-IN');
const current = () => state.masters.find((m) => m.type === state.type);

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2500);
}

async function loadMasters() {
  state.masters = await api('/api/masters');
  if (!state.type) state.type = (location.hash.slice(1) && state.masters.some((m) => m.type === location.hash.slice(1))) ? location.hash.slice(1) : state.masters[0].type;
  renderTabs();
}

function renderTabs() {
  $('tabs').innerHTML = state.masters.map((m) =>
    `<button class="tab" role="tab" data-type="${m.type}" aria-selected="${m.type === state.type}">${esc(m.label)}<span class="badge">${fmt(m.count)}</span></button>`
  ).join('');
  const m = current();
  $('title').textContent = m.label;
  $('meta').textContent = m.lastUpdated ? `${fmt(m.count)} records · last updated ${m.lastUpdated}` : 'No records yet — upload an Excel file to start.';
  $('hCode').textContent = m.codeLabel;
  $('hDesc').textContent = m.descLabel;
  $('btnExport').href = `/api/masters/${m.type}/export`;
  $('btnTemplate').href = `/api/masters/${m.type}/template`;
}

async function loadRows() {
  const { type, page, size, q } = state;
  const d = await api(`/api/masters/${type}?page=${page}&size=${size}&q=${encodeURIComponent(q)}`);
  state.total = d.total;
  const pages = Math.max(1, Math.ceil(d.total / size));
  $('rows').innerHTML = d.rows.length ? d.rows.map((r) => `
    <tr>
      <td class="c-code">${esc(r.code)}</td>
      <td>${r.description ? esc(r.description) : '<span class="blank">(no description)</span>'}</td>
      <td class="c-upd">${esc(r.updated_at)}</td>
      <td class="c-act"><button class="link" data-edit="${esc(r.code)}">Edit</button><button class="link danger" data-del="${esc(r.code)}">Delete</button></td>
    </tr>`).join('')
    : `<tr><td colspan="4" class="empty">${q ? 'No matches for “' + esc(q) + '”' : 'No records'}</td></tr>`;
  $('count').textContent = q ? `${fmt(d.total)} match${d.total === 1 ? '' : 'es'}` : `${fmt(d.total)} records`;
  $('pageInfo').textContent = `Page ${page} of ${pages}`;
  $('prev').disabled = page <= 1;
  $('next').disabled = page >= pages;
  // Keep the row data for the edit dialog.
  state.rowMap = new Map(d.rows.map((r) => [r.code, r]));
}

async function loadLogs() {
  const logs = await api(`/api/masters/${state.type}/logs`);
  $('logs').innerHTML = logs.length ? logs.map((l) => `<tr><td>${esc(l.created_at)}</td><td>${esc(l.file_name || '')}</td><td>${esc((l.sheet_name || '').trim())}</td><td>${esc(l.mode)}</td><td>${fmt(l.inserted)}</td><td>${fmt(l.updated)}</td><td>${fmt(l.unchanged)}</td><td>${fmt(l.skipped)}</td></tr>`).join('')
    : '<tr><td colspan="8" class="empty">No uploads yet</td></tr>';
}

async function refresh({ tabs = false } = {}) {
  try {
    if (tabs) await loadMasters();
    await Promise.all([loadRows(), loadLogs()]);
  } catch (e) { toast(e.message); }
}

function selectType(type) {
  state.type = type; state.page = 1; state.q = ''; $('search').value = '';
  history.replaceState(null, '', '#' + type);
  renderTabs(); refresh();
}

// ---------- Upload ----------
function openUpload(target) {
  state.uploadTarget = target; // a master type, or 'workbook'
  const m = current();
  $('upTitle').textContent = target === 'workbook' ? 'Upload full workbook' : `Upload ${m.label}`;
  $('upHint').textContent = target === 'workbook'
    ? 'Select the expense report workbook. Every master tab found (Material, Offsetting, Order, Cost Center, Account Description) is updated.'
    : `Excel with two columns: ${m.codeLabel} and ${m.descLabel}. If the file has a "${m.label}" tab it is used, otherwise the first sheet.`;
  $('upFile').value = '';
  $('upResult').hidden = true;
  $('upGo').disabled = false;
  $('dlgUpload').showModal();
}

function summary(r) {
  return `${fmt(r.inserted)} new · ${fmt(r.updated)} updated · ${fmt(r.unchanged)} unchanged` + (r.skipped ? ` · ${fmt(r.skipped)} duplicate rows skipped` : '');
}

async function doUpload() {
  const file = $('upFile').files[0];
  const out = $('upResult');
  if (!file) { out.className = 'result error'; out.textContent = 'Choose an Excel file first.'; out.hidden = false; return; }
  const mode = document.querySelector('input[name="mode"]:checked').value;
  if (mode === 'replace' && !confirm('Replace all will delete existing records before loading the file. Continue?')) return;

  const url = state.uploadTarget === 'workbook' ? `/api/upload-workbook?mode=${mode}` : `/api/masters/${state.uploadTarget}/upload?mode=${mode}`;
  out.className = 'result busy'; out.textContent = `Uploading ${file.name} (${(file.size / 1048576).toFixed(1)} MB)… large workbooks can take a minute.`; out.hidden = false;
  $('upGo').disabled = true;
  try {
    const r = await api(url, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) } });
    out.className = 'result';
    out.textContent = state.uploadTarget === 'workbook'
      ? Object.values(r.results).map((x) => `${x.label}: ${summary(x)}`).join('\n')
      : `Sheet "${r.sheetName}": ${summary(r)}`;
    refresh({ tabs: true });
  } catch (e) {
    out.className = 'result error'; out.textContent = e.message;
  } finally { $('upGo').disabled = false; }
}

// ---------- Add / edit ----------
function openEdit(code) {
  const m = current();
  state.editing = code ?? null;
  const row = code != null ? state.rowMap.get(code) : null;
  $('edTitle').textContent = row ? `Edit ${m.label}` : `Add ${m.label}`;
  $('edCodeLbl').textContent = m.codeLabel;
  $('edDescLbl').textContent = m.descLabel;
  $('edCode').value = row ? row.code : '';
  $('edCode').readOnly = !!row;
  $('edDesc').value = row ? row.description : '';
  $('edErr').hidden = true;
  $('dlgEdit').showModal();
  (row ? $('edDesc') : $('edCode')).focus();
}

async function saveEdit(ev) {
  ev.preventDefault();
  const code = $('edCode').value.trim(), description = $('edDesc').value.trim();
  try {
    if (state.editing != null) {
      await api(`/api/masters/${state.type}/item/${encodeURIComponent(state.editing)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description }) });
    } else {
      await api(`/api/masters/${state.type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, description }) });
    }
    $('dlgEdit').close();
    toast('Saved');
    refresh({ tabs: true });
  } catch (e) { $('edErr').textContent = e.message; $('edErr').hidden = false; }
}

async function del(code) {
  if (!confirm(`Delete ${current().codeLabel} ${code}?`)) return;
  try {
    await api(`/api/masters/${state.type}/item/${encodeURIComponent(code)}`, { method: 'DELETE' });
    toast('Deleted');
    refresh({ tabs: true });
  } catch (e) { toast(e.message); }
}

// ---------- Wiring ----------
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) selectType(b.dataset.type); });
$('rows').addEventListener('click', (e) => {
  if (e.target.dataset.edit !== undefined) openEdit(e.target.dataset.edit);
  if (e.target.dataset.del !== undefined) del(e.target.dataset.del);
});
let searchTimer;
$('search').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.q = e.target.value; state.page = 1; loadRows().catch((x) => toast(x.message)); }, 250); });
$('prev').onclick = () => { state.page--; loadRows(); };
$('next').onclick = () => { state.page++; loadRows(); };
$('size').onchange = (e) => { state.size = +e.target.value; state.page = 1; loadRows(); };
$('btnUpload').onclick = () => openUpload(state.type);
$('btnWorkbook').onclick = () => openUpload('workbook');
$('upGo').onclick = doUpload;
$('upClose').onclick = () => $('dlgUpload').close();
$('btnAdd').onclick = () => openEdit(null);
$('edCancel').onclick = () => $('dlgEdit').close();
$('editForm').addEventListener('submit', saveEdit);

refresh({ tabs: true });

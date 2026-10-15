// Thin wrapper around the FastAPI endpoints.
async function request(path, opts = {}) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data.detail;
    throw new Error(typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg).join('; ') : `Request failed (${res.status})`);
  }
  return data;
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function upload(path, file, mode) {
  const form = new FormData();
  form.append('file', file);
  return request(`${path}?mode=${mode}`, { method: 'POST', body: form });
}

export const api = {
  masters: () => request('/api/masters'),
  rows: (type, { q, page, size }) => request(`/api/masters/${type}?q=${encodeURIComponent(q)}&page=${page}&size=${size}`),
  logs: (type) => request(`/api/masters/${type}/logs`),
  deleteLog: (type, id) => request(`/api/masters/${type}/logs/${id}`, { method: 'DELETE' }),
  clearLogs: (type) => request(`/api/masters/${type}/logs`, { method: 'DELETE' }),
  add: (type, data) => request(`/api/masters/${type}`, json('POST', data)),
  update: (type, id, data) => request(`/api/masters/${type}/rows/${id}`, json('PUT', data)),
  remove: (type, id) => request(`/api/masters/${type}/rows/${id}`, { method: 'DELETE' }),
  upload: (type, file, mode) => upload(`/api/masters/${type}/upload`, file, mode),
  uploadWorkbook: (file, mode) => upload('/api/upload-workbook', file, mode),
  sapProcess: (file) => { const f = new FormData(); f.append('file', file); return request('/api/sap/process', { method: 'POST', body: f }); },
  sapRuns: () => request('/api/sap/runs'),
  sapRun: (id) => request(`/api/sap/runs/${id}`),
  deleteSapRun: (id) => request(`/api/sap/runs/${id}`, { method: 'DELETE' }),
  clearSapRuns: () => request('/api/sap/runs', { method: 'DELETE' }),
  sapDownloadUrl: (id) => `/api/sap/runs/${id}/download`,
  exportUrl: (type) => `/api/masters/${type}/export`,
  templateUrl: (type) => `/api/masters/${type}/template`,
};

export const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

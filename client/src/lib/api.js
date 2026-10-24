// Thin fetch wrapper for the HRMS API. Every state-changing request carries
// the X-Requested-With header the server uses as its CSRF guard.
const apiBase = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
export const apiUrl = (path) => `${apiBase}${path}`;
export const apiAssetUrl = (url) => (url?.startsWith('/api/') ? apiUrl(url.slice(4)) : url);

export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, credentials: 'include', headers: { 'X-Requested-With': 'hrms' } };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(apiUrl(path), opts);
  if (res.status === 401 && !path.startsWith('/auth'))
    window.dispatchEvent(new Event('hrms:unauthorized'));
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(
      (data && (data.error || data.message)) || `Request failed (${res.status})`,
    );
    err.status = res.status;
    err.code = data?.code;
    err.data = data;
    throw err;
  }
  return data;
}
api.get = (p) => api(p);
api.post = (p, body = {}) => api(p, { method: 'POST', body });
api.put = (p, body = {}) => api(p, { method: 'PUT', body });
api.del = (p) => api(p, { method: 'DELETE' });
api.upload = (p, form, method = 'POST') => api(p, { method, form });

export function photoUrl(employeeId) {
  return apiUrl(`/files/photo/${employeeId}`);
}

// Opens a GET download (CSV, documents) using the session cookie.
export function download(path) {
  const a = document.createElement('a');
  a.href = apiUrl(path);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Saves the body of a POST response (e.g. a generated CSV) as a file.
export async function postDownload(path, body, filename) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'hrms', 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || 'Download failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

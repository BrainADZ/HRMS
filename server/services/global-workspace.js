// The launcher is configured server-side, never accepted from a return URL parameter.
export function globalAppsUrl(req) {
  const configured = process.env.GLOBAL_PORTAL_URL;
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      url.hostname !== req.hostname ||
      (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
    )
      return null;
    return url.origin + '/apps';
  } catch {
    return null;
  }
}

export function isGlobalAppSession(req) {
  if (!globalAppsUrl(req)) return false;
  const parts = String(req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim());
  const token = (name) => {
    const entries = parts.filter((s) => s.startsWith(name + '='));
    const value = entries.length === 1 ? entries[0].slice(name.length + 1) : '';
    return /^[a-f0-9]{64}$/.test(value) ? value : null;
  };
  const native = token(process.env.SESSION_COOKIE_NAME || 'hrms_session');
  return Boolean(native && native === token('brainadz_global_session'));
}

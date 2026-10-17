// POSIX subset of node:path used by the server routes.
export function join(...parts) { return parts.filter(Boolean).join('/').replace(/\/+/g, '/'); }
export function resolve(...parts) {
  const result = [];
  for (const part of join(...parts).split('/')) {
    if (part === '..') result.pop();
    else if (part && part !== '.') result.push(part);
  }
  return '/' + result.join('/');
}
export function basename(p) { return String(p).split('/').pop(); }
export function dirname(p) { const s = String(p).split('/'); s.pop(); return s.join('/') || '/'; }
export function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i) : '';
}
export default { join, resolve, basename, dirname, extname };

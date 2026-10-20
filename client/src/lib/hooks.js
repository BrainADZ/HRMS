import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useApp } from '../context.jsx';

const VERTICAL_LISTS = new Set(['/dashboard', '/hiring', '/screener', '/employees', '/documents', '/documents/checklist',
  '/attendance/today', '/attendance/register', '/attendance/locations', '/attendance/short-hours', '/attendance/corrections', '/performance', '/payroll',
  '/reports/summary', '/leave/overview', '/leave/requests', '/leave/calendar', '/leave/register', '/resignations', '/posh',
  '/candidates', '/requests']);

export function withVertical(path, vertical) {
  if (!path || !vertical || !VERTICAL_LISTS.has(path.split('?')[0])) return path;
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  params.set('vertical', String(vertical));
  return `${pathname}?${params}`;
}

// Loads `path` and keeps the previous data while reloading to avoid flicker.
export function useApi(path) {
  const { vertical, isAdmin } = useApp();
  const documentPath = ['/documents', '/documents/checklist'].includes(path?.split('?')[0]);
  const scopedPath = withVertical(path, documentPath && !isAdmin ? null : vertical);
  const [state, setState] = useState({ key: scopedPath, data: null, loading: Boolean(scopedPath), error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!scopedPath) {
      setState({ key: scopedPath, data: null, loading: false, error: null });
      return undefined;
    }
    let alive = true;
    setState((s) => ({ ...s, key: scopedPath, data: s.key === scopedPath ? s.data : null, loading: true }));
    api(scopedPath)
      .then((data) => alive && setState({ key: scopedPath, data, loading: false, error: null }))
      .catch((e) => alive && setState((s) => ({ key: scopedPath, data: s.key === scopedPath ? s.data : null, loading: false, error: e.message })));
    return () => {
      alive = false;
    };
  }, [scopedPath, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  return { ...state, data: state.key === scopedPath ? state.data : null, reload, setData };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useClickOutside(onOutside) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onOutside]);
  return ref;
}

// Small form-state helper: const [f, set, setF] = useForm({...}); <input value={f.x} onChange={set('x')} />
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const set = useCallback((k) => (e) => {
    const v = e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setValues((s) => ({ ...s, [k]: v }));
  }, []);
  return [values, set, setValues];
}

// Runs an async action with a busy flag and toast feedback.
export function useAction(toast) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, success) => {
    setBusy(true);
    try {
      const out = await fn();
      if (success && toast) toast(typeof success === 'function' ? success(out) : success, 'success');
      return out;
    } catch (e) {
      if (toast) toast(e.message, 'error');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return [run, busy];
}

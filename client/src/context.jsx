import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './lib/api.js';
import { setTimeZone } from './lib/format.js';
import { clearWorkday } from './lib/workday.js';
import NotificationToast from './components/NotificationToast.jsx';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const VKEY = 'hrms.vertical';
const readVertical = () => {
  try {
    return Number(localStorage.getItem(VKEY)) || null;
  } catch {
    return null;
  }
};

export function AppProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [info, setInfo] = useState({});
  const [meta, setMeta] = useState(null);
  const [vertical, setVerticalState] = useState(readVertical);
  const [toasts, setToasts] = useState([]);
  const [photoVersion, setPhotoVersion] = useState(0);

  const dismissToast = useCallback((id) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const toast = useCallback((text, kind = 'info', options = {}) => {
    const tid = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id: tid, text, kind, onClick: options.onClick }].slice(-4));
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      setUser(me.user);
      setInfo({ companyName: me.companyName, demo: me.demo, ai: me.ai, sessionExpiresAt: me.sessionExpiresAt });
      if (me.user.mustChangePassword) { setMeta(null); return; }
      const m = await api.get('/meta');
      setTimeZone(m.settings.timezone);
      setMeta(m);
    } catch {
      setUser(null);
      setMeta(null);
    }
  }, []);

  const refreshMeta = useCallback(async () => setMeta(await api.get('/meta')), []);
  const refreshPhotos = useCallback(async () => {
    await loadMe();
    setPhotoVersion(Date.now());
  }, [loadMe]);

  useEffect(() => {
    loadMe();
    const h = () => { clearWorkday(); setUser(null); setMeta(null); };
    window.addEventListener('hrms:unauthorized', h);
    return () => window.removeEventListener('hrms:unauthorized', h);
  }, [loadMe]);

  useEffect(() => {
    if (!user) return;
    const expire = () => window.dispatchEvent(new Event('hrms:unauthorized'));
    const expiry = Date.parse(info.sessionExpiresAt);
    const timeout = Number.isFinite(expiry) ? setTimeout(expire, Math.max(0, Math.min(2147483647, expiry - Date.now()))) : null;
    const timer = setInterval(() => {
      api.get('/auth/me').catch((error) => { if (error.status === 401) expire(); });
    }, 60000);
    return () => { clearTimeout(timeout); clearInterval(timer); };
  }, [user?.id, info.sessionExpiresAt]);

  const setVertical = useCallback((v) => {
    setVerticalState(v);
    try {
      if (v) localStorage.setItem(VKEY, String(v));
      else localStorage.removeItem(VKEY);
    } catch { /* storage unavailable */ }
  }, []);

  // pause: stop the work clock; the next sign-in asks the reason for the gap.
  const logout = useCallback(async ({ pause = false } = {}) => {
    await api.post('/auth/logout', { pause });
    clearWorkday();
    setUser(null);
    setMeta(null);
  }, []);

  const value = useMemo(() => {
    const role = user?.role;
    const visibleMeta = meta && vertical ? { ...meta, employees: meta.employees.filter((e) => e.vertical_id === vertical) } : meta;
    return {
      user, info, meta: visibleMeta, vertical, setVertical, toast, loadMe, refreshMeta, refreshPhotos, photoVersion, logout,
      isHR: role === 'admin' || role === 'hr',
      isAdmin: role === 'admin',
      isManager: role === 'manager',
      isEmployeeOnly: role === 'employee',
      employeeName: (eid) => meta?.employees.find((e) => e.id === eid)?.name || '',
      verticalById: (vid) => meta?.verticals.find((v) => v.id === vid),
    };
  }, [user, info, meta, vertical, setVertical, toast, loadMe, refreshMeta, refreshPhotos, photoVersion, logout]);

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="toasts">
        {toasts.map((t) => <NotificationToast key={t.id} item={t} onClose={dismissToast} />)}
      </div>
    </AppCtx.Provider>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Search, ChevronDown,
  Menu as MenuIcon, LogOut, KeyRound, User, LayoutGrid, CheckCheck, Camera,
} from 'lucide-react';
import { useApp } from '../context.jsx';
import { api } from '../lib/api.js';
import { ago } from '../lib/format.js';
import { useClickOutside, useDebounced } from '../lib/hooks.js';
import { Avatar, Button, Field, Input, Modal } from './ui.jsx';
import WorkClock, { SignInPrompts, SignOutModal, LocationGuard } from './WorkClock.jsx';
import { useWorkday } from '../lib/workday.js';
import CompanyLogo from './CompanyLogo.jsx';
import ProfilePhoto from './ProfilePhoto.jsx';
import FloatingNav from './FloatingNav.jsx';
import {
  IconDashboard, IconMySpace, IconHiring, IconScreener, IconEmployees, IconDocuments,
  IconHolidays, IconPayroll, IconResignation, IconReports, IconSettings,
  IconPolicies, IconPerformance, IconLeave, IconAttendance, IconPosh,
  IconBell,
} from './icons.jsx';

export function Logo({ size = '', showHrms = true }) {
  return (
    <div className={`logo ${size}`}>
      <CompanyLogo compact={size === 'sm'} />
      {showHrms && <div className="h">HRMS</div>}
    </div>
  );
}

const VERTICAL_LOGOS = {
  Live: 'live-optimized.webp',
  Marketing: 'marketing-optimized.webp',
  Exhibits: 'exhibits-optimized.webp',
};
export function VerticalLogo({ v, active, onClick }) {
  return (
    <button type="button" className={`vlogo ${active ? 'active' : ''}`} onClick={onClick} aria-pressed={Boolean(active)} title={active ? `Showing ${v.name} only. Click to show all verticals.` : `Show ${v.name} only`}>
      <img className="vertical-logo" src={`${import.meta.env.BASE_URL}${VERTICAL_LOGOS[v.short]}`} alt={v.name} width="126" height="76" />
    </button>
  );
}

export function BrandBanner() {
  const { vertical, verticalById } = useApp();
  const selected = vertical && verticalById(vertical);
  return (
    <div className="brand-banner">
      <div>
        <div className="big"><CompanyLogo /> <span className="h">HRMS</span></div>
        <div className="sub">{selected ? `${selected.name} people operations` : 'Unified people operations across all BrainADZ verticals'}</div>
      </div>
      <div className="script">People<br />Power<br />Progress</div>
    </div>
  );
}

function Leaves() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
      <path d="M95 118c-6-30-4-58 14-92" stroke="#3f8f3a" strokeWidth="2.5" fill="none" />
      <path d="M100 70c-24-6-38-24-36-46 22 2 38 20 36 46z" fill="#5cb85c" />
      <path d="M100 70c-10-14-20-26-36-46" stroke="#3f8f3a" strokeWidth="1.5" fill="none" />
      <path d="M104 95c18-10 26-30 18-52-20 8-28 30-18 52z" fill="#7ccf5e" />
      <path d="M97 105c-22 2-40-10-46-30 22-4 40 8 46 30z" fill="#4aa84a" />
      <path d="M108 40c6-16 4-30-6-40-8 12-8 28 6 40z" fill="#8fdc6a" />
    </svg>
  );
}

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, roles: ['admin', 'hr', 'manager'], end: true },
  { to: '/my', label: 'My Space', icon: IconMySpace, roles: ['employee', 'manager'] },
  { to: '/hiring', label: 'Hiring', icon: IconHiring, roles: ['admin', 'hr', 'manager'] },
  { to: '/screener', label: 'Resume Screener AI', icon: IconScreener, roles: ['admin', 'hr'] },
  { to: '/employees', label: 'Employees', icon: IconEmployees },
  { to: '/documents', label: 'Documents', icon: IconDocuments },
  { label: 'Policies', icon: IconPolicies, children: [
    { to: '/performance', label: 'Appraisal Policy', icon: IconPerformance },
    { to: '/leave', label: 'Leave Policy', icon: IconLeave },
    { to: '/attendance', label: 'Attendance Policy', icon: IconAttendance },
    { to: '/posh', label: 'POSH Policy', icon: IconPosh },
  ] },
  { to: '/calendar', label: 'Holiday Calendar', icon: IconHolidays },
  { to: '/payroll', label: 'Payroll', icon: IconPayroll, roles: ['admin', 'hr'] },
  { to: '/resignation', label: 'Resignation', icon: IconResignation },
  { to: '/reports', label: 'Reports', icon: IconReports, roles: ['admin', 'hr'] },
  { to: '/settings', label: 'Settings', icon: IconSettings, roles: ['admin', 'hr'] },
];

const NAV_LAYOUT_KEY = 'hrms.navLayout';
const readFloating = () => {
  try { return localStorage.getItem(NAV_LAYOUT_KEY) === 'floating'; } catch { return false; }
};

function Sidebar({ open, onClose, onFloat }) {
  const { user, setVertical } = useApp();
  const { pathname } = useLocation();
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [policiesHovered, setPoliciesHovered] = useState(false);
  const policiesActive = NAV.find((n) => n.children).children.some((n) => pathname === n.to);
  const policiesExpanded = policiesOpen || policiesHovered;
  useEffect(() => { setPoliciesOpen(policiesActive); }, [pathname, policiesActive]);
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));
  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><Link to={user.role === 'employee' ? '/my' : '/'} onClick={() => { setVertical(null); onClose(); }} style={{ textDecoration: 'none' }} title="Show all BrainADZ verticals"><Logo showHrms={false} /></Link></div>
        <nav className="nav" aria-label="Main">
          {items.map((n) => n.children ? (
            <div key={n.label} className="nav-group" onMouseEnter={() => setPoliciesHovered(true)} onMouseLeave={() => setPoliciesHovered(false)}>
              <button type="button" className={`nav-group-toggle ${policiesActive ? 'active' : ''}`} aria-expanded={policiesExpanded} aria-controls="policies-submenu"
                onClick={() => { setPoliciesHovered(false); setPoliciesOpen((value) => !value); }}
                onKeyDown={(e) => { if (e.key === 'Escape') { setPoliciesOpen(false); setPoliciesHovered(false); } }}>
                <n.icon size={21} strokeWidth={1.9} />{n.label}
                <ChevronDown size={16} className={`nav-group-chevron ${policiesExpanded ? 'expanded' : ''}`} />
              </button>
              <div id="policies-submenu" className="nav-submenu" hidden={!policiesExpanded}>
                {n.children.map((child) => (
                  <NavLink key={child.to} to={child.to} onClick={onClose}>
                    <child.icon size={17} strokeWidth={1.9} />{child.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ) : (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={onClose}>
              <n.icon size={21} strokeWidth={1.9} />{n.label}
            </NavLink>
          ))}
          <button type="button" className="nav-act" onClick={() => { onClose(); onFloat(); }} title="Use a draggable floating menu">
            <img className="nav-act-ic" src={`${import.meta.env.BASE_URL}icon.png`} alt="" width="26" height="26" />Floating menu
          </button>
        </nav>
        <div className="leaf-card">
          <b>Great People Build Brighter Tomorrows</b>
          <i />
          <Leaves />
        </div>
      </aside>
    </>
  );
}

function GlobalSearch() {
  const { vertical } = useApp();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [focus, setFocus] = useState(0);
  const dq = useDebounced(q, 220);
  const nav = useNavigate();
  const ref = useClickOutside(useCallback(() => setOpen(false), []));
  useEffect(() => {
    if (dq.trim().length < 2) return setResults([]);
    let alive = true;
    api.get(`/search?q=${encodeURIComponent(dq.trim())}${vertical ? `&vertical=${vertical}` : ''}`).then((r) => alive && (setResults(r.results), setFocus(0))).catch(() => {});
    return () => { alive = false; };
  }, [dq, vertical]);
  const go = (r) => {
    setOpen(false);
    setQ('');
    nav(r.link);
  };
  return (
    <div className="search" ref={ref}>
      <Search size={18} />
      <input
        value={q} placeholder="Search employees, jobs, policies…" aria-label="Search"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setFocus((f) => Math.min(results.length - 1, f + 1));
          if (e.key === 'ArrowUp') setFocus((f) => Math.max(0, f - 1));
          if (e.key === 'Enter' && results[focus]) go(results[focus]);
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && q.trim().length >= 2 && (
        <div className="dropdown" style={{ left: 0, right: 'auto', width: '100%', minWidth: 300 }}>
          {results.length === 0 ? <div className="item muted">No matches</div> : results.map((r, i) => (
            <div key={`${r.type}${r.id}`} className={`item ${i === focus ? 'focus' : ''}`} onMouseDown={() => go(r)}>
              {r.type === 'Employee' ? <Avatar name={r.title} size={30} /> : <span className="badge b-blue" style={{ minWidth: 70, justifyContent: 'center' }}>{r.type}</span>}
              <div style={{ minWidth: 0 }}><div className="b6 ellipsis">{r.title}</div><div className="small muted ellipsis">{r.subtitle}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { toast } = useApp();
  const seen = useRef(null);
  const mounted = useRef(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const nav = useNavigate();
  const loc = useLocation();
  const ref = useClickOutside(useCallback(() => setOpen(false), []));
  const load = useCallback(() => api.get('/notifications').then((result) => {
    if (!mounted.current) return;
    if (seen.current) {
      result.items.filter((item) => !item.read && !seen.current.has(item.id)).slice(0, 4).reverse().forEach((item) => {
        toast(item.text, 'info', { onClick: () => { setOpen(false); if (item.link) nav(item.link); } });
      });
    }
    if (!seen.current) seen.current = new Set();
    result.items.forEach((item) => seen.current.add(item.id));
    setData(result);
  }).catch(() => {}), [toast, nav]);
  useEffect(() => {
    mounted.current = true;
    load();
    const t = setInterval(load, 15000);
    return () => { mounted.current = false; clearInterval(t); };
  }, [load, loc.pathname]);
  const click = async (n) => {
    if (!n.read) await api.post(`/notifications/${n.id}/read`).catch(() => {});
    setOpen(false);
    load();
    if (n.link) nav(n.link);
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="icon-btn" aria-label={`Notifications (${data.unread} unread)`} onClick={() => setOpen((o) => !o)}>
        <IconBell size={22} />
        {data.unread > 0 && <span className="badge-dot">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="dropdown" style={{ width: 360 }}>
          <div className="head">Notifications {data.unread > 0 && <button type="button" className="link" onClick={async () => { await api.post('/notifications/read-all'); load(); }}><CheckCheck size={14} />Mark all read</button>}</div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {data.items.length === 0 && <div className="item muted">You're all caught up.</div>}
            {data.items.map((n) => (
              <div key={n.id} className="item" onClick={() => click(n)} style={{ alignItems: 'flex-start' }}>
                <span className="dot" style={{ background: n.read ? 'transparent' : 'var(--red)', marginTop: 6 }} />
                <div><div style={{ fontSize: 13.5, fontWeight: n.read ? 400 : 600, lineHeight: 1.4 }}>{n.text}</div><div className="xs muted mt-8" style={{ marginTop: 3 }}>{ago(n.created_at)}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ChangePassword({ onClose, forced }) {
  const { toast, loadMe } = useApp();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    if (f.next !== f.confirm) return setErr('New passwords do not match');
    setBusy(true);
    setErr('');
    try {
      await api.post('/auth/change-password', { current: f.current, next: f.next });
      toast('Password changed', 'success');
      await loadMe();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={forced ? 'Set a new password' : 'Change password'} size="narrow" onClose={forced ? undefined : onClose}
      footer={<>{!forced && <Button onClick={onClose}>Cancel</Button>}<Button variant="primary" loading={busy} onClick={save}>Save password</Button></>}>
      <div className="col" style={{ gap: 14 }}>
        {forced && <div className="alert info">You signed in with a temporary password. Choose your own to continue.</div>}
        <Field label="Current password"><Input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
        <Field label="New password" hint="At least 8 characters with letters and numbers"><Input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
        <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
        {err && <div className="error-text">{err}</div>}
      </div>
    </Modal>
  );
}

function UserMenu() {
  const { user, logout, toast } = useApp();
  const workday = useWorkday();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const signOut = () => {
    setOpen(false);
    if (workday?.workday?.openSince) setLeaving(true);
    else logout().catch((error) => toast(error.message || 'Could not sign out. Please try again.', 'error'));
  };
  const nav = useNavigate();
  const ref = useClickOutside(useCallback(() => setOpen(false), []));
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="user-chip" onClick={() => setOpen((o) => !o)} aria-label="Account menu">
        <Avatar name={user.name} id={user.employeeId} hasPhoto={user.hasPhoto} src={!user.employeeId ? user.photoUrl : undefined} size={46} />
        <div className="who"><div className="nm">{user.name}</div><div className="rl">{user.designation}</div></div>
        <ChevronDown size={18} className="muted" />
      </button>
      {open && (
        <div className="dropdown" style={{ width: 240 }}>
          <div className="head" style={{ display: 'block' }}><div>{user.name}</div><div className="small muted" style={{ fontWeight: 400 }}>{user.email} · {user.role}</div></div>
          <div className="item" onClick={() => { setOpen(false); nav('/my'); }}><LayoutGrid size={16} />My Space</div>
          {user.employeeId && <div className="item" onClick={() => { setOpen(false); nav(`/employees/${user.employeeId}`); }}><User size={16} />My profile</div>}
          <button type="button" className="item" style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }} onClick={() => { setOpen(false); setPhoto(true); }}><Camera size={16} />Change photo</button>
          <div className="item" onClick={() => { setOpen(false); setPw(true); }}><KeyRound size={16} />Change password</div>
          <div className="item" style={{ color: 'var(--red)' }} onClick={signOut}><LogOut size={16} />Sign out</div>
        </div>
      )}
      {pw && <ChangePassword onClose={() => setPw(false)} />}
      {photo && <ProfilePhoto onClose={() => setPhoto(false)} />}
      {leaving && <SignOutModal onClose={() => setLeaving(false)} />}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, meta, vertical, setVertical } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [floating, setFloating] = useState(readFloating);
  const focusFloat = useRef(false);
  const goFloating = () => {
    focusFloat.current = true;
    setFloating(true);
    try { localStorage.setItem(NAV_LAYOUT_KEY, 'floating'); } catch { /* Storage unavailable */ }
  };
  const dock = () => {
    setFloating(false);
    try { localStorage.setItem(NAV_LAYOUT_KEY, 'docked'); } catch { /* Storage unavailable */ }
    setTimeout(() => document.querySelector('.nav-act')?.focus({ preventScroll: true }), 60);
  };
  const floatItems = NAV.filter((n) => !n.roles || n.roles.includes(user.role)).flatMap((n) => n.children || [n]);
  const verticals = (meta?.verticals || []).filter((v) => v.short !== 'Corporate');
  return (
    <div className={`app ${floating ? 'nav-floating' : ''}`}>
      <Sidebar open={open} onClose={() => setOpen(false)} onFloat={goFloating} />
      {floating && <FloatingNav items={floatItems} onDock={dock} focusOnMount={focusFloat} />}
      <div className="main">
        <header className="topbar no-print">
          <button type="button" className="icon-btn burger" aria-label="Open menu" onClick={() => setOpen(true)}><MenuIcon size={22} /></button>
          {user.role !== 'employee' && (
            <div className="verticals">
              {verticals.map((v) => <VerticalLogo key={v.id} v={v} active={vertical === v.id} onClick={() => { setVertical(vertical === v.id ? null : v.id); navigate('/'); }} />)}
            </div>
          )}
          <div className="spacer" />
          <GlobalSearch />
          <WorkClock />
          <Notifications />
          <UserMenu />
        </header>
        <main className="content">{children}</main>
      </div>
      {user.mustChangePassword && <ChangePassword forced onClose={() => {}} />}
      <SignInPrompts />
      <LocationGuard />
    </div>
  );
}

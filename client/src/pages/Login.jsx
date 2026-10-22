import { useEffect, useState } from 'react';
import { LogIn, Users, CalendarDays, CreditCard, Sparkles, MapPin } from 'lucide-react';
import { api } from '../lib/api.js';
import { withLocation } from '../lib/location.js';
import { useApp } from '../context.jsx';
import { Avatar, Field, Input } from '../components/ui.jsx';
import { Logo } from '../components/Layout.jsx';
import CelebrationBoard from '../components/CelebrationBoard.jsx';

export default function Login() {
  const { loadMe } = useApp();
  const [cfg, setCfg] = useState(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [loginType, setLoginType] = useState('employee');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [locating, setLocating] = useState(false);
  // A message left by the app when it signed someone out (e.g. they left the office).
  const [flash] = useState(() => {
    try {
      const m = sessionStorage.getItem('hrms.flash');
      sessionStorage.removeItem('hrms.flash');
      return m;
    } catch { return null; }
  });
  useEffect(() => { api.get('/auth/config').then(setCfg).catch(() => setCfg({ demoAccounts: [] })); }, []);

  const signIn = async (e, creds) => {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      // Development restarts rotate quick-login tokens while this page stays open.
      // Resolve the selected registered account again immediately before sign-in.
      if (creds?.quickLoginToken) {
        const latest = await api.get('/auth/config');
        setCfg(latest);
        const account = latest.quickAccounts?.find((a) => a.loginType === creds.loginType
          && (a.loginType === 'admin' ? a.email === creds.email : a.username === creds.username));
        if (!account) throw new Error('Quick login is unavailable for this account. Refresh the page or sign in with your password.');
        creds = { loginType: account.loginType, ...(account.loginType === 'admin' ? { email: account.email } : { username: account.username }), quickLoginToken: account.quickLoginToken };
      }
      await withLocation((location) => api.post('/auth/login', { ...(creds || { loginType, ...(loginType === 'admin' ? { email } : { username }), password }), ...(location ? { location } : {}) }), { onLocating: setLocating });
      await loadMe();
    } catch (ex) {
      setErr({ message: ex.message, outside: ex.code === 'outside_office' || ex.code === 'location_imprecise' });
    } finally {
      setBusy(false);
    }
  };

  const quickAccounts = cfg?.quickAccounts?.length ? cfg.quickAccounts : (cfg?.demo ? cfg.demoAccounts : []);

  const requestPassword = async () => {
    if (loginType === 'admin' ? !email.trim() : !username.trim()) { setErr({ message: loginType === 'admin' ? 'Enter your admin email first.' : 'Enter your employee username first.' }); return; }
    setRequesting(true);
    setErr(null);
    setRequestMessage('');
    try {
      const result = await api.post('/auth/password-reset-request', { loginType, ...(loginType === 'admin' ? { email: email.trim() } : { username: username.trim() }) });
      setRequestMessage(result.message);
    } catch (ex) { setErr({ message: ex.message }); }
    finally { setRequesting(false); }
  };

  return (
    <div className="login">
      <div className="left">
        <Logo />
        <div>
          <h2>Unified people operations across all BrainADZ verticals.</h2>
          <p>Hiring, onboarding, attendance, leave, payroll, performance, POSH and exits for BrainADZ Live, Marketing and Exhibits, in one place.</p>
          <div className="row wrap mt-16" style={{ gap: 18, marginTop: 28 }}>
            {[[Users, 'Employee records'], [CalendarDays, 'Leave & attendance'], [CreditCard, 'Indian payroll'], [Sparkles, 'AI resume screening']].map(([I, t]) => (
              <span key={t} className="row" style={{ gap: 8, color: 'rgba(255,255,255,.9)', fontSize: 14 }}><I size={18} />{t}</span>
            ))}
          </div>
        </div>
        <div style={{ fontFamily: 'Caveat, cursive', fontSize: 30, opacity: 0.9 }}>People · Power · Progress</div>
      </div>
      <div className="right">
        <div className="box">
          <h1 style={{ fontSize: 28, letterSpacing: '-0.5px' }}>Sign in</h1>
          <p className="muted mt-8">Welcome back to {cfg?.companyName || 'BrainADZ'} HRMS.</p>
          <CelebrationBoard publicView />
          {cfg?.officeOnly && <p className="small muted mt-8 row gap-6"><MapPin size={15} />Sign-in works only from a {cfg.companyName || 'BrainADZ'} office. Your browser will ask to share your location.</p>}
          {flash && <div className="alert warn mt-16">{flash}</div>}
          <form className="col mt-16" style={{ gap: 14, marginTop: 24 }} onSubmit={signIn}>
            <div className="row gap-8" role="group" aria-label="Sign-in type">
              <button type="button" className={`btn sm ${loginType === 'employee' ? 'primary' : ''}`} aria-pressed={loginType === 'employee'} disabled={busy || requesting} onClick={() => { setLoginType('employee'); setErr(null); setRequestMessage(''); }}>Employee login</button>
              <button type="button" className={`btn sm ${loginType === 'admin' ? 'primary' : ''}`} aria-pressed={loginType === 'admin'} disabled={busy || requesting} onClick={() => { setLoginType('admin'); setErr(null); setRequestMessage(''); }}>Admin login</button>
            </div>
            {loginType === 'admin'
              ? <Field label="Admin email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@yourcompany.com" required /></Field>
              : <Field label="Username" hint="First name + BZL (Live), BZM (Marketing), BZE (Exhibits) or BZ (Corporate) + employee number, e.g. AaravBZL030."><Input autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="AaravBZL030" required /></Field>}
            <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <button type="button" className="link" style={{ alignSelf: 'flex-end' }} disabled={requesting || busy} onClick={requestPassword}>{requesting ? 'Sending request…' : loginType === 'admin' ? 'Forgot password?' : 'Forgot password? Ask admin'}</button>
            {requestMessage && <div className="alert info">{requestMessage}</div>}
            {err && <div className="alert error"><div>{err.message}{err.outside && <div className="mt-8">On an approved work-from-home or leave day you can sign in from anywhere.</div>}</div></div>}
            <button type="submit" className="btn primary lg block" disabled={busy}>{locating ? <MapPin size={18} /> : <LogIn size={18} />}{locating ? 'Checking your location…' : busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          {quickAccounts.length > 0 && (
            <div className="mt-16" style={{ marginTop: 28 }}>
              <div className="small muted b6 mb-8">QUICK LOGIN</div>
              <div className="col" style={{ gap: 8 }}>
                {quickAccounts.map((a) => {
                  const name = a.name || a.email.split('@')[0].split('.').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
                  return (
                    <button key={a.email} type="button" className="demo-acc" disabled={busy || requesting} onClick={() => signIn(null, { loginType: a.loginType, ...(a.loginType === 'admin' ? { email: a.email } : { username: a.username }), ...(a.quickLoginToken ? { quickLoginToken: a.quickLoginToken } : { password: a.password }) })}>
                      <Avatar name={name} size={34} />
                      <div className="grow"><div className="b6">{name}</div><div className="small muted">{a.loginType === 'admin' ? a.email : a.username}</div></div>
                      <span className="badge b-blue">{a.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

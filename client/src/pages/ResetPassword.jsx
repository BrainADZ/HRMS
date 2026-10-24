import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Field, Input } from '../components/ui.jsx';

export default function ResetPassword() {
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') || '',
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, '', '/reset-password');
  }, []);
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/password-reset', { token, password });
      setDone(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="login"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <div className="card" style={{ width: 400, maxWidth: 'calc(100vw - 32px)' }}>
        <h1 style={{ fontSize: 24 }}>Reset admin password</h1>
        {done ? (
          <div className="alert info mt-16">Password updated. Sign in with your new password.</div>
        ) : !token ? (
          <div className="alert error mt-16">
            This reset link is invalid. Request a new link from the login page.
          </div>
        ) : (
          <form className="col mt-16" style={{ gap: 14 }} onSubmit={submit}>
            <Field
              label="New password"
              hint="At least 8 characters, including letters and numbers."
            >
              <Input
                aria-label="New password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </Field>
            <Field label="Confirm password">
              <Input
                aria-label="Confirm password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                disabled={busy}
              />
            </Field>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button className="btn primary block" type="submit" disabled={busy}>
              {busy ? 'Updating…' : 'Reset password'}
            </button>
          </form>
        )}
        <a className="link mt-16" href="/">
          Back to sign in
        </a>
      </div>
    </div>
  );
}

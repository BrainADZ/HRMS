import crypto from 'node:crypto';
import { audit, fail } from '../core.js';
import { hashPassword, checkPasswordStrength } from '../auth.js';
import { workflow } from '../database/workflows.js';

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const RESET_EMAIL_MESSAGE = 'If this admin email is registered, a password reset link has been sent. Please check your inbox and spam folder.';

export async function requestAdminReset(db, mailer, email) {
  if (!mailer) fail(503, 'Password reset email is currently unavailable. Please contact support.');
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = digest(token);
  const user = await workflow(db, async () => {
    const account = await db.get("SELECT id, email, password_hash FROM users WHERE LOWER(email) = ? AND role = 'admin' AND active = 1", email);
    if (!account) return null;
    const recent = await db.get('SELECT created_at FROM admin_password_reset_tokens WHERE user_id = ?', account.id);
    if (recent && Date.now() - new Date(recent.created_at).getTime() < 60000) return null;
    await db.run('DELETE FROM admin_password_reset_tokens WHERE user_id = ?', account.id);
    await db.insert('admin_password_reset_tokens', { user_id: account.id, token_hash: tokenHash, password_fingerprint: digest(account.password_hash), expires_at: new Date(Date.now() + 30 * 60000).toISOString() });
    return account;
  });
  if (!user) return;
  const resetUrl = new URL('/reset-password', mailer.appUrl);
  resetUrl.hash = new URLSearchParams({ token }).toString();
  try {
    // SMTP must not hold the application write lock.
    await mailer.send({ to: user.email, resetUrl: resetUrl.toString() });
  } catch {
    await workflow(db, () => db.run('DELETE FROM admin_password_reset_tokens WHERE token_hash = ?', tokenHash));
    fail(503, 'Password reset email could not be sent. Please try again later.');
  }
}

export async function completeAdminReset(db, token, password) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail(400, 'This reset link is invalid or expired. Request a new link.');
  checkPasswordStrength(password);
  const reset = await db.get(`SELECT t.user_id, t.password_fingerprint, t.expires_at, u.password_hash, u.role, u.active
    FROM admin_password_reset_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`, digest(token));
  if (!reset || reset.role !== 'admin' || !reset.active || new Date(reset.expires_at).getTime() <= Date.now() || reset.password_fingerprint !== digest(reset.password_hash)) {
    fail(400, 'This reset link is invalid or expired. Request a new link.');
  }
  await db.update('users', reset.user_id, { password_hash: hashPassword(password), must_change_password: 0 });
  await db.run('DELETE FROM admin_password_reset_tokens WHERE user_id = ?', reset.user_id);
  await db.run('DELETE FROM sessions WHERE user_id = ?', reset.user_id);
  await db.run("UPDATE password_reset_requests SET status = 'Resolved', resolved_at = ? WHERE user_id = ? AND status = 'Pending'", new Date().toISOString(), reset.user_id);
  await audit(db, { id: reset.user_id }, 'password.email_reset', 'user', reset.user_id);
}

import { openDb } from '../db.js';
import { checkPasswordStrength, hashPassword } from '../auth.js';

const email = String(process.env.MASTER_ADMIN_EMAIL || '')
  .trim()
  .toLowerCase();
const password = process.env.MASTER_ADMIN_PASSWORD;
let db;

try {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Set a valid MASTER_ADMIN_EMAIL');
  db = await openDb();
  const existing = await db.get(
    'SELECT id, role, master_admin, active FROM users WHERE LOWER(email) = ?',
    email,
  );
  if (existing) {
    if (existing.role !== 'admin' || !existing.master_admin || !existing.active)
      throw new Error(
        'This email already belongs to another account. Choose a different MASTER_ADMIN_EMAIL.',
      );
    console.log(`Master admin already exists: ${email}. No account or password was changed.`);
  } else {
    if (!password) throw new Error('Set MASTER_ADMIN_PASSWORD for the initial account creation');
    checkPasswordStrength(password);
    if (password.length < 12)
      throw new Error('MASTER_ADMIN_PASSWORD must be at least 12 characters');
    await db.insert('users', {
      email,
      password_hash: hashPassword(password),
      role: 'admin',
      master_admin: 1,
      display_name: 'Master Admin',
      must_change_password: 1,
    });
    console.log(
      `Master admin created: ${email}. Sign in as administrator and change the password.`,
    );
  }
} catch (error) {
  console.error(`Master admin creation failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db?.close();
}

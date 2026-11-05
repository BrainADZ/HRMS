import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { fail, str } from '../core.js';

// Only the server-side Global gateway may supply an original client IP.
export async function globalLoginRequest(db, req) {
  const expected = process.env.GLOBAL_GATEWAY_SECRET || '';
  if (expected.length < 32) fail(503, 'Global sign-in is not configured');
  const supplied = req.get('X-BrainADZ-Gateway-Key') || '';
  const digest = (value) => createHash('sha256').update(value).digest();
  if (supplied.length > 256 || !timingSafeEqual(digest(supplied), digest(expected))) {
    fail(403, 'Global gateway authentication required');
  }
  const ip = req.get('X-BrainADZ-Client-IP') || '';
  if (!isIP(ip)) fail(400, 'Valid client IP required');
  if (typeof req.body.identifier !== 'string') fail(400, 'Email or username is required');
  const identifier = str(req.body.identifier, {
    required: true,
    max: 200,
    name: 'Email or username',
  }).toLowerCase();
  const matches = await db.all(
    `SELECT id, password_hash, active
     FROM users
     WHERE LOWER(email) = ? OR LOWER(username) = ?
     LIMIT 2`,
    identifier,
    identifier,
  );
  // Cross-field collisions must not choose another person's account.
  return { identifier, ip, user: matches.length === 1 ? matches[0] : null };
}

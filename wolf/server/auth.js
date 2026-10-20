import crypto from 'node:crypto';
import { config } from './config.js';

export const COOKIE = 'wolf_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  // Compare against a same-length buffer so length differences do not short-circuit timing.
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/** Hash format: scrypt$<salt b64url>$<key b64url> */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${b64(salt)}$${b64(key)}`;
}

function verifyHash(password, stored) {
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const derived = crypto.scryptSync(password, Buffer.from(salt, 'base64url'), 64);
  return safeEqual(b64(derived), key);
}

export function checkCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  const userOk = safeEqual(username.trim().toLowerCase(), config.username.toLowerCase());
  let passOk = false;
  if (config.passwordHash) passOk = verifyHash(password, config.passwordHash);
  else if (config.password) passOk = safeEqual(password, config.password);
  return userOk && passOk;
}

export function createSession(username) {
  const payload = b64(JSON.stringify({ u: username, exp: Date.now() + MAX_AGE_MS }));
  return `${payload}.${sign(payload)}`;
}

export function readSession(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? { username: data.u } : null;
  } catch {
    return null;
  }
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  maxAge: MAX_AGE_MS,
  path: '/',
});

export function requireAuth(req, res, next) {
  const session = readSession(req.cookies?.[COOKIE]);
  if (!session) return res.status(401).json({ error: 'Sign in to continue' });
  req.user = session;
  next();
}

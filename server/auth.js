import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { get, run } from './db.js';

const SECRET = process.env.KINDRED_SECRET || 'kindred-dev-secret-change-me';
const COOKIE = 'kindred_session';
const MAX_AGE = 60 * 60 * 24 * 7;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [salt, key] = String(stored).split(':');
  if (!salt || !key) return false;
  const a = Buffer.from(key, 'hex');
  const b = scryptSync(password, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

const sign = (value) => createHmac('sha256', SECRET).update(value).digest('base64url');

export function issueToken(userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export const sessionCookie = (token) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Resolves the signed cookie, or an `Authorization: Bearer <token>` header. */
export function currentUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const data = readToken(cookies[COOKIE] || bearer);
  if (!data) return null;
  return get('SELECT id, team_id, name, email, role, avatar FROM users WHERE id = ?', data.uid) || null;
}

export function login(email, password) {
  const user = get('SELECT * FROM users WHERE lower(email) = lower(?)', String(email || '').trim());
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) return null;
  run('INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)', randomBytes(12).toString('hex'), user.id, new Date().toISOString());
  return user;
}

/** Judge sharing: one passcode, one read-heavy demo account, no signup flow. */
export function judgeLogin(passcode) {
  const expected = process.env.JUDGE_PASSCODE || 'kindred';
  if (String(passcode || '').trim() !== expected) return null;
  return get("SELECT * FROM users WHERE role = 'judge' LIMIT 1") || null;
}

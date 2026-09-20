import { env } from 'cloudflare:workers';
import { queryOne, run } from './db';
import { hashPassword, verifyPassword } from './password';
import type { SessionUser } from './types';

export { hashPassword, verifyPassword };

export const SESSION_COOKIE = 'rflare_session';
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;
/** Renew the session when less than half its lifetime remains. */
const RENEW_WHEN_REMAINING_SECONDS = SESSION_TTL_SECONDS / 2;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacBase64Url(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Cookie value is `<token>.<hmac>`. The HMAC lets middleware reject garbage
 * without a database round-trip; the database only ever stores sha256(token),
 * so a leaked database cannot be replayed as a session.
 */
export async function createSession(userId: string): Promise<{ token: string; maxAge: number }> {
  const raw = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [
    await sha256Hex(raw),
    userId,
    expiresAt,
  ]);
  const signature = await hmacBase64Url(env.SESSION_SECRET, raw);
  return { token: `${raw}.${signature}`, maxAge: SESSION_TTL_SECONDS };
}

export async function destroySession(cookieValue: string | null): Promise<void> {
  const raw = parseSessionCookie(cookieValue);
  if (!raw) return;
  await run('DELETE FROM sessions WHERE id = ?', [await sha256Hex(raw)]);
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

function parseSessionCookie(cookieValue: string | null): string | null {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot <= 0) return null;
  return cookieValue.slice(0, dot);
}

export async function verifySessionCookie(cookieValue: string | null): Promise<SessionUser | null> {
  if (!cookieValue) return null;
  const raw = parseSessionCookie(cookieValue);
  const signature = cookieValue.slice(cookieValue.lastIndexOf('.') + 1);
  if (!raw || !signature) return null;

  const expected = await hmacBase64Url(env.SESSION_SECRET, raw);
  if (!timingSafeStringEqual(signature, expected)) return null;

  const row = await queryOne<{
    id: string;
    user_id: string;
    email: string;
    display_name: string | null;
    avatar_key: string | null;
    expires_at: string;
  }>(
    `SELECT sessions.id AS id, users.id AS user_id, users.email AS email,
            users.display_name AS display_name, users.avatar_key AS avatar_key,
            sessions.expires_at AS expires_at
       FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = ?`,
    [await sha256Hex(raw)],
  );
  if (!row) return null;

  if (Date.parse(row.expires_at) <= Date.now()) {
    await run('DELETE FROM sessions WHERE id = ?', [row.id]);
    return null;
  }

  // Sliding expiration for active users.
  const remaining = Date.parse(row.expires_at) - Date.now();
  if (remaining < RENEW_WHEN_REMAINING_SECONDS * 1000) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    await run('UPDATE sessions SET expires_at = ? WHERE id = ?', [expiresAt, row.id]);
  }

  return { id: row.user_id, email: row.email, displayName: row.display_name, hasAvatar: Boolean(row.avatar_key) };
}

export function serializeSessionCookie(token: string, maxAge: number): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

export function clearSessionCookie(): string {
  return [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=0'].join('; ');
}

export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=') || null;
  }
  return null;
}

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const row = await queryOne<{
    id: string;
    email: string;
    password_hash: string;
    display_name: string | null;
    avatar_key: string | null;
  }>('SELECT id, email, password_hash, display_name, avatar_key FROM users WHERE lower(email) = lower(?)', [email]);
  if (!row) return null;
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;
  await run('DELETE FROM sessions WHERE expires_at <= ?', [new Date().toISOString()]);
  return { id: row.id, email: row.email, displayName: row.display_name, hasAvatar: Boolean(row.avatar_key) };
}

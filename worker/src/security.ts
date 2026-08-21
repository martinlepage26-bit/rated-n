import { ApiProblem } from './http';
import type { Env, UserRow } from './types';

const encoder = new TextEncoder();
const SESSION_COOKIE = 'rated_n_session';
const PASSWORD_ITERATIONS = 120_000;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function randomToken(size = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function protectedHash(value: string, env: Env): Promise<string> {
  if (!env.AUTH_PEPPER) throw new ApiProblem(503, 'auth_not_configured', 'Account security is not configured.');
  return sha256(`${env.AUTH_PEPPER}:${value}`);
}

export async function hashPassword(password: string, salt = randomToken(18), iterations = PASSWORD_ITERATIONS): Promise<{ hash: string; salt: string; iterations: number }> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: base64UrlToBytes(salt) as BufferSource, iterations }, key, 256);
  return { hash: bytesToBase64Url(new Uint8Array(bits)), salt, iterations };
}

export function constantTimeEqual(left: string, right: string): boolean {
  const size = Math.max(left.length, right.length);
  let result = left.length ^ right.length;
  for (let index = 0; index < size; index += 1) result |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return result === 0;
}

export async function verifyPassword(password: string, user: UserRow): Promise<boolean> {
  if (!user.password_hash || !user.password_salt || !user.password_iterations) return false;
  const candidate = await hashPassword(password, user.password_salt, user.password_iterations);
  return constantTimeEqual(candidate.hash, user.password_hash);
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new ApiProblem(400, 'invalid_email', 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || /[\r\n]/u.test(email)) {
    throw new ApiProblem(400, 'invalid_email', 'Enter a valid email address.');
  }
  return email;
}

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) {
    throw new ApiProblem(400, 'invalid_password', 'Use a password between 10 and 128 characters.');
  }
  return value;
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function secureCookie(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !origin || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname);
}

export function sessionCookie(request: Request, token: string, maxAgeSeconds: number): string {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secureCookie(request)) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(request: Request): string {
  return sessionCookie(request, '', 0);
}

export async function createSession(env: Env, userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken();
  const tokenHash = await protectedHash(token, env);
  const days = Math.max(1, Math.min(90, Number(env.SESSION_DAYS || 30)));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 86_400_000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, tokenHash, expiresAt, now.toISOString(), now.toISOString()).run();
  return { token, expiresAt };
}

export async function currentUser(request: Request, env: Env): Promise<UserRow | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !env.AUTH_PEPPER) return null;
  const tokenHash = await protectedHash(token, env);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(tokenHash, now).first<UserRow>();
  if (row) await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').bind(now, tokenHash).run();
  return row || null;
}

export async function requireUser(request: Request, env: Env): Promise<UserRow> {
  const user = await currentUser(request, env);
  if (!user) throw new ApiProblem(401, 'authentication_required', 'Log in to continue.');
  return user;
}

export async function deleteCurrentSession(request: Request, env: Env): Promise<void> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !env.AUTH_PEPPER) return;
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await protectedHash(token, env)).run();
}

export async function checkRateLimit(env: Env, key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const hashedKey = await sha256(key);
  await env.DB.prepare(`INSERT INTO rate_limits (key, window_start, request_count) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET
      window_start = CASE WHEN excluded.window_start - rate_limits.window_start >= ? THEN excluded.window_start ELSE rate_limits.window_start END,
      request_count = CASE WHEN excluded.window_start - rate_limits.window_start >= ? THEN 1 ELSE rate_limits.request_count + 1 END`)
    .bind(hashedKey, now, windowSeconds, windowSeconds).run();
  const row = await env.DB.prepare('SELECT request_count FROM rate_limits WHERE key = ?').bind(hashedKey).first<{ request_count: number }>();
  if ((row?.request_count || 0) > limit) throw new ApiProblem(429, 'rate_limited', 'Too many attempts. Please wait and try again.');
}

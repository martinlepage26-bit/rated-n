import { EmailMessage } from 'cloudflare:email';
import { ApiProblem, json, readJson, redirect } from './http';
import {
  checkRateLimit,
  clearSessionCookie,
  constantTimeEqual,
  createSession,
  currentUser,
  deleteCurrentSession,
  hashPassword,
  normalizeEmail,
  protectedHash,
  randomToken,
  sessionCookie,
  validatePassword,
  verifyPassword
} from './security';
import type { Env, UserRow } from './types';

function nowIso(): string { return new Date().toISOString(); }
function futureIso(minutes: number): string { return new Date(Date.now() + minutes * 60_000).toISOString(); }

function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw;
}

function clientKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

async function sendTextEmail(env: Env, to: string, subject: string, body: string): Promise<void> {
  if (!env.EMAIL || !env.EMAIL_FROM) throw new ApiProblem(503, 'email_unavailable', 'Email delivery is not configured yet.');
  const fromAddress = env.EMAIL_FROM.match(/<([^>]+)>/u)?.[1] || env.EMAIL_FROM;
  const messageIdDomain = fromAddress.split('@')[1];
  const raw = [
    `From: ${env.EMAIL_FROM}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${messageIdDomain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body
  ].join('\r\n');
  await env.EMAIL.send(new EmailMessage(fromAddress, to, raw));
}

async function issueVerification(env: Env, user: UserRow): Promise<void> {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const created = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE email_verifications SET used_at = ? WHERE user_id = ? AND used_at IS NULL').bind(created, user.id),
    env.DB.prepare('INSERT INTO email_verifications (id, user_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), user.id, await protectedHash(`${user.id}:${code}`, env), futureIso(10), created)
  ]);
  await sendTextEmail(env, user.email, 'Your Rated N verification code', `Your Rated N verification code is ${code}.\n\nIt expires in 10 minutes. If you did not create this account, you can ignore this message.`);
}

async function login(request: Request, env: Env): Promise<Response> {
  const input = await readJson<{ email?: unknown; password?: unknown }>(request);
  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  await checkRateLimit(env, `login:${clientKey(request)}:${email}`, 12, 900);
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user || !await verifyPassword(password, user)) throw new ApiProblem(401, 'invalid_credentials', 'Invalid email or password.');
  if (!user.email_verified) throw new ApiProblem(403, 'email_not_verified', 'Verify your email before logging in.');
  const session = await createSession(env, user.id);
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': sessionCookie(request, session.token, Math.round((Date.parse(session.expiresAt) - Date.now()) / 1000)) });
}

async function register(request: Request, env: Env): Promise<Response> {
  if (!env.EMAIL) throw new ApiProblem(503, 'email_unavailable', 'Email registration is temporarily unavailable.');
  const input = await readJson<{ email?: unknown; password?: unknown }>(request);
  const email = normalizeEmail(input.email);
  const password = validatePassword(input.password);
  await checkRateLimit(env, `register:${clientKey(request)}:${email}`, 5, 3600);
  const existing = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (existing?.email_verified) throw new ApiProblem(409, 'account_exists', 'An account already exists for this email.');
  const passwordData = await hashPassword(password);
  const created = nowIso();
  const user: UserRow = existing || {
    id: crypto.randomUUID(), email, password_hash: null, password_salt: null, password_iterations: null,
    email_verified: 0, auth_provider: 'email', created_at: created, updated_at: created
  };
  if (existing) {
    await env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?')
      .bind(passwordData.hash, passwordData.salt, passwordData.iterations, created, user.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, password_salt, password_iterations, email_verified, auth_provider, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'email', ?, ?)`)
      .bind(user.id, email, passwordData.hash, passwordData.salt, passwordData.iterations, created, created).run();
  }
  await issueVerification(env, { ...user, password_hash: passwordData.hash, password_salt: passwordData.salt, password_iterations: passwordData.iterations });
  return json({ ok: true, verification_required: true }, 201);
}

async function verifyEmail(request: Request, env: Env): Promise<Response> {
  const input = await readJson<{ email?: unknown; code?: unknown }>(request);
  const email = normalizeEmail(input.email);
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (!/^\d{6}$/u.test(code)) throw new ApiProblem(400, 'invalid_code', 'Enter the six-digit verification code.');
  await checkRateLimit(env, `verify:${clientKey(request)}:${email}`, 10, 900);
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) throw new ApiProblem(400, 'invalid_code', 'That verification code is invalid or expired.');
  const challenge = await env.DB.prepare(`SELECT id, code_hash, attempts FROM email_verifications WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1`)
    .bind(user.id, nowIso()).first<{ id: string; code_hash: string; attempts: number }>();
  if (!challenge || challenge.attempts >= 6 || !constantTimeEqual(challenge.code_hash, await protectedHash(`${user.id}:${code}`, env))) {
    if (challenge) await env.DB.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').bind(challenge.id).run();
    throw new ApiProblem(400, 'invalid_code', 'That verification code is invalid or expired.');
  }
  const updated = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE email_verifications SET used_at = ? WHERE id = ?').bind(updated, challenge.id),
    env.DB.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').bind(updated, user.id)
  ]);
  const session = await createSession(env, user.id);
  return json({ user: publicUser({ ...user, email_verified: 1 }) }, 200, { 'Set-Cookie': sessionCookie(request, session.token, Math.round((Date.parse(session.expiresAt) - Date.now()) / 1000)) });
}

async function resend(request: Request, env: Env): Promise<Response> {
  if (!env.EMAIL) throw new ApiProblem(503, 'email_unavailable', 'Email delivery is temporarily unavailable.');
  const { email: rawEmail } = await readJson<{ email?: unknown }>(request);
  const email = normalizeEmail(rawEmail);
  await checkRateLimit(env, `resend:${clientKey(request)}:${email}`, 3, 3600);
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (user && !user.email_verified) await issueVerification(env, user);
  return json({ ok: true });
}

async function forgotPassword(request: Request, env: Env): Promise<Response> {
  if (!env.EMAIL) throw new ApiProblem(503, 'email_unavailable', 'Password reset email is temporarily unavailable.');
  const { email: rawEmail } = await readJson<{ email?: unknown }>(request);
  const email = normalizeEmail(rawEmail);
  await checkRateLimit(env, `forgot:${clientKey(request)}:${email}`, 4, 3600);
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (user) {
    const token = randomToken();
    const created = nowIso();
    await env.DB.batch([
      env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').bind(created, user.id),
      env.DB.prepare('INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), user.id, await protectedHash(token, env), futureIso(30), created)
    ]);
    const url = `${env.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
    await sendTextEmail(env, email, 'Reset your Rated N password', `Use this secure link to reset your Rated N password:\n\n${url}\n\nThe link expires in 30 minutes. If you did not request it, you can ignore this message.`);
  }
  return json({ ok: true });
}

async function resetPassword(request: Request, env: Env): Promise<Response> {
  const input = await readJson<{ token?: unknown; password?: unknown }>(request);
  const token = typeof input.token === 'string' ? input.token : '';
  const password = validatePassword(input.password);
  if (!token) throw new ApiProblem(400, 'invalid_reset_token', 'That reset link is invalid or expired.');
  await checkRateLimit(env, `reset:${clientKey(request)}`, 8, 3600);
  const reset = await env.DB.prepare(`SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`)
    .bind(await protectedHash(token, env), nowIso()).first<{ id: string; user_id: string }>();
  if (!reset) throw new ApiProblem(400, 'invalid_reset_token', 'That reset link is invalid or expired.');
  const passwordData = await hashPassword(password);
  const updated = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, email_verified = 1, updated_at = ? WHERE id = ?')
      .bind(passwordData.hash, passwordData.salt, passwordData.iterations, updated, reset.user_id),
    env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').bind(updated, reset.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(reset.user_id)
  ]);
  return json({ ok: true });
}

function publicUser(user: UserRow): { id: string; email: string } {
  return { id: user.id, email: user.email };
}

async function googleStart(url: URL, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new ApiProblem(503, 'google_auth_unavailable', 'Google sign-in is not configured yet.');
  const state = randomToken();
  const created = nowIso();
  await env.DB.prepare('INSERT INTO oauth_states (id, state_hash, return_to, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), await protectedHash(state, env), safeReturnTo(url.searchParams.get('returnTo')), futureIso(10), created).run();
  const callback = `${env.APP_ORIGIN}/api/auth/google/callback`;
  const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  google.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callback, response_type: 'code', scope: 'openid email', state, prompt: 'select_account' }).toString();
  return redirect(google.toString());
}

async function googleCallback(url: URL, request: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new ApiProblem(503, 'google_auth_unavailable', 'Google sign-in is not configured yet.');
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  if (!state || !code) throw new ApiProblem(400, 'oauth_failed', 'Google did not return a valid authorization response.');
  const stateRow = await env.DB.prepare('SELECT id, return_to FROM oauth_states WHERE state_hash = ? AND expires_at > ?')
    .bind(await protectedHash(state, env), nowIso()).first<{ id: string; return_to: string }>();
  if (!stateRow) throw new ApiProblem(400, 'oauth_state_invalid', 'This Google sign-in request has expired.');
  await env.DB.prepare('DELETE FROM oauth_states WHERE id = ?').bind(stateRow.id).run();
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${env.APP_ORIGIN}/api/auth/google/callback`, grant_type: 'authorization_code' })
  });
  if (!tokenResponse.ok) throw new ApiProblem(502, 'oauth_exchange_failed', 'Google sign-in could not be completed.');
  const token = await tokenResponse.json<{ access_token?: string }>();
  if (!token.access_token) throw new ApiProblem(502, 'oauth_exchange_failed', 'Google sign-in could not be completed.');
  const infoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!infoResponse.ok) throw new ApiProblem(502, 'oauth_profile_failed', 'Google account details could not be loaded.');
  const info = await infoResponse.json<{ email?: string; email_verified?: boolean }>();
  if (!info.email || !info.email_verified) throw new ApiProblem(403, 'oauth_email_unverified', 'Use a verified Google email address.');
  const email = normalizeEmail(info.email);
  const existing = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  const timestamp = nowIso();
  const userId = existing?.id || crypto.randomUUID();
  if (existing) await env.DB.prepare("UPDATE users SET email_verified = 1, auth_provider = 'google', updated_at = ? WHERE id = ?").bind(timestamp, userId).run();
  else await env.DB.prepare("INSERT INTO users (id, email, email_verified, auth_provider, created_at, updated_at) VALUES (?, ?, 1, 'google', ?, ?)").bind(userId, email, timestamp, timestamp).run();
  const session = await createSession(env, userId);
  return redirect(`${env.APP_ORIGIN}${safeReturnTo(stateRow.return_to)}`, sessionCookie(request, session.token, Math.round((Date.parse(session.expiresAt) - Date.now()) / 1000)));
}

export async function handleAuth(request: Request, url: URL, path: string, env: Env): Promise<Response> {
  if (request.method === 'GET' && path === '/auth/me') {
    const user = await currentUser(request, env);
    return json({ user: user ? publicUser(user) : null });
  }
  if (request.method === 'POST' && path === '/auth/login') return login(request, env);
  if (request.method === 'POST' && path === '/auth/logout') {
    await deleteCurrentSession(request, env);
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
  }
  if (request.method === 'POST' && path === '/auth/register') return register(request, env);
  if (request.method === 'POST' && path === '/auth/verify') return verifyEmail(request, env);
  if (request.method === 'POST' && path === '/auth/resend') return resend(request, env);
  if (request.method === 'POST' && path === '/auth/password/forgot') return forgotPassword(request, env);
  if (request.method === 'POST' && path === '/auth/password/reset') return resetPassword(request, env);
  if (request.method === 'GET' && path === '/auth/google') return googleStart(url, env);
  if (request.method === 'GET' && path === '/auth/google/callback') return googleCallback(url, request, env);
  throw new ApiProblem(404, 'not_found', 'That account endpoint does not exist.');
}

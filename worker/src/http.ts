import type { Env } from './types';

export class ApiProblem extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiProblem';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
};

/**
 * Rejects CR/LF in a value interpolated into a mail header. Every caller today
 * passes an address through normalizeEmail, which already refuses newlines, so
 * this guards the boundary rather than a live hole: sendTextEmail builds raw
 * headers by concatenation, and its safety should not depend on each caller
 * remembering to sanitise first.
 */
export function assertHeaderSafe(value: string, field: string): string {
  if (/[\r\n]/u.test(value)) throw new ApiProblem(400, 'invalid_email_header', `The ${field} value contains an illegal line break.`);
  return value;
}

export function json(payload: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return Response.json(payload, {
    status,
    headers: { ...SECURITY_HEADERS, ...extraHeaders }
  });
}

export function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location, ...SECURITY_HEADERS });
  if (cookie) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

export async function readJson<T>(request: Request, maxBytes = 80_000): Promise<T> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new ApiProblem(413, 'payload_too_large', 'That request is too large.');
  const raw = await request.text();
  if (raw.length > maxBytes) throw new ApiProblem(413, 'payload_too_large', 'That request is too large.');
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiProblem(400, 'invalid_json', 'The request body must be valid JSON.');
  }
}

export function assertSameOrigin(request: Request, env: Env): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
  const origin = request.headers.get('Origin');
  if (!origin) return;
  const allowed = new URL(env.APP_ORIGIN);
  const actual = new URL(origin);
  const local = ['localhost', '127.0.0.1'].includes(actual.hostname);
  const projectPreview = allowed.hostname.endsWith('.pages.dev') && actual.protocol === 'https:' && actual.hostname.endsWith(`.${allowed.hostname}`);
  if (!local && !projectPreview && actual.origin !== allowed.origin) {
    throw new ApiProblem(403, 'origin_rejected', 'The request origin was rejected.');
  }
}

export function handleError(caught: unknown): Response {
  if (caught instanceof ApiProblem) {
    return json({ error: { code: caught.code, message: caught.message, ...(caught.details === undefined ? {} : { details: caught.details }) } }, caught.status);
  }
  console.error('request_failed', caught instanceof Error ? caught.message : String(caught));
  return json({ error: { code: 'internal_error', message: 'Rated N could not complete that request.' } }, 500);
}

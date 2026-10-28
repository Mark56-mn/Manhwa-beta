import type { Env } from './env';

/**
 * Exact-origin allow-list and CORS policy (TASK-IMPLEMENT-SHARED-FOUNDATION).
 *
 * Two hosts (Vercel and Freebuff) eventually call one authoritative API, so
 * cross-origin access needs an explicit list. Rules:
 *  - Only exact, configured origins are echoed back. Wildcards are impossible:
 *    `Access-Control-Allow-Origin: *` is never emitted, because credentials
 *    (the session cookie) require a concrete origin.
 *  - `ALLOWED_ORIGINS` is a comma-separated list; `APP_ORIGIN` is always
 *    included. Both are public configuration, never secrets.
 *  - Mutations require an allow-listed `Origin` header. A missing Origin
 *    (non-browser caller) or a foreign Origin is rejected, which is the CSRF /
 *    same-origin guard.
 *  - `Authorization` must be advertised in a preflight: since TASK 11 the
 *    browser sends a Supabase access token as `Bearer`, and an unlisted header
 *    fails the preflight before any route (or auth) code runs.
 */

export const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

const ALLOWED_REQUEST_HEADERS = [
  'Authorization',
  'Content-Type',
  'X-Project-Id',
  'X-Filename',
  'X-Request-Id'
].join(', ');

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    // An origin carries no path, query or fragment.
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Every configured, normalized origin (deduplicated, order preserved). */
export function allowedOrigins(env: Env): string[] {
  const configured = [
    ...(env.APP_ORIGIN ? [env.APP_ORIGIN] : []),
    ...(env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : [])
  ];
  const result: string[] = [];
  for (const entry of configured) {
    const origin = normalizeOrigin(entry);
    if (origin && !result.includes(origin)) result.push(origin);
  }
  return result;
}

/** True when the value is a bare http(s) origin (no path, query or credentials). */
export function isValidOrigin(value: string | undefined | null): boolean {
  if (!value) return false;
  return normalizeOrigin(value) !== null;
}

/** True for an absolute http(s) URL; paths are allowed (used for the issuer). */
export function isValidHttpUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string | undefined | null, env: Env): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  return normalized !== null && allowedOrigins(env).includes(normalized);
}

/** Response headers for an allowed cross-origin request; null otherwise. */
export function corsHeadersFor(origin: string | undefined | null, env: Env): Record<string, string> | null {
  if (!isAllowedOrigin(origin, env)) return null;
  const normalized = normalizeOrigin(origin as string) as string;
  return {
    'Access-Control-Allow-Origin': normalized,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin'
  };
}

/** Headers for a preflight response; null when the origin is not allowed. */
export function preflightHeadersFor(
  origin: string | undefined | null,
  env: Env
): Record<string, string> | null {
  const base = corsHeadersFor(origin, env);
  if (!base) return null;
  return {
    ...base,
    'Access-Control-Allow-Methods': ['GET', 'HEAD', ...MUTATING_METHODS, 'OPTIONS'].join(', '),
    'Access-Control-Allow-Headers': ALLOWED_REQUEST_HEADERS,
    'Access-Control-Max-Age': '600'
  };
}

/**
 * CSRF / same-origin guard for state-changing routes.
 *
 * A concrete Origin must be exactly on the allow-list. A page served with
 * `Referrer-Policy: no-referrer` posts `Origin: null` even to its own origin,
 * so — matching the provider's documented `isSameOriginRequest` contract —
 * `Origin: null`/absent is accepted only when the browser asserts
 * `Sec-Fetch-Site: same-origin` AND this API itself is served from an
 * allow-listed origin. `Sec-Fetch-Site` is browser-set; a non-browser caller
 * can spoof it but has no ambient session cookie to abuse. An unlisted Origin
 * always wins and is rejected.
 */
export function isAllowedMutationOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  if (origin && origin !== 'null') return isAllowedOrigin(origin, env);

  if (request.headers.get('Sec-Fetch-Site') !== 'same-origin') return false;
  try {
    return isAllowedOrigin(new URL(request.url).origin, env);
  } catch {
    return false;
  }
}

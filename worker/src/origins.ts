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
 */

export const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

const ALLOWED_REQUEST_HEADERS = [
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
 * CSRF / same-origin guard for state-changing routes: the request must carry
 * an Origin that is on the allow-list. No "if header missing, allow" branch.
 */
export function isAllowedMutationOrigin(request: Request, env: Env): boolean {
  return isAllowedOrigin(request.headers.get('Origin'), env);
}

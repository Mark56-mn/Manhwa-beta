/**
 * Frontend API configuration (TASK-VERCEL-DEPLOYMENT-READINESS).
 *
 * The single place that decides where the browser sends API requests. It is
 * public, build-time configuration — Vite inlines `VITE_API_BASE_URL` into the
 * bundle, so a secret must never be put in it.
 *
 * Resolution is deliberately explicit instead of silently falling back:
 *  - unset / empty   -> `same-origin`: the API is served from this same origin
 *                       (how the Worker-hosted build runs).
 *  - a bare origin   -> `configured`: the API lives on that origin.
 *  - anything else   -> `invalid`: never guessed, never treated as same-origin,
 *                       so a sorting typo cannot look like a working deployment.
 */

export type ApiConfig =
  | { kind: 'same-origin'; baseUrl: '' }
  | { kind: 'configured'; baseUrl: string }
  | { kind: 'invalid'; raw: string };

/** Read the build-time value without ever throwing in a non-Vite runtime. */
export function readApiBaseUrlRaw(): string {
  try {
    const env = (import.meta as { env?: Record<string, unknown> }).env;
    const value = env?.VITE_API_BASE_URL;
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

/**
 * Validate a configured value. Only an absolute http(s) origin is accepted:
 * the API client appends `/api/...` itself, and credentials ride on a cookie,
 * so a path or embedded credentials would silently break either one.
 */
export function resolveApiConfig(raw: string = readApiBaseUrlRaw()): ApiConfig {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'same-origin', baseUrl: '' };

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'invalid', raw };
    if (url.username || url.password) return { kind: 'invalid', raw };
    if (url.pathname !== '/' || url.search || url.hash) return { kind: 'invalid', raw };
    return { kind: 'configured', baseUrl: url.origin };
  } catch {
    return { kind: 'invalid', raw };
  }
}

/** The resolved API origin, or '' when the API is expected on this origin. */
export function readApiBaseUrl(): string {
  const config = resolveApiConfig();
  return config.kind === 'configured' ? config.baseUrl : '';
}

/** Guidance shown when a static host was deployed without its API origin. */
export const MISSING_API_BASE_URL_HINT =
  'This page was built without VITE_API_BASE_URL, so the browser called the API on its own origin and received a web page instead. ' +
  'When the frontend is hosted separately from the API, set VITE_API_BASE_URL to the API origin and rebuild — env changes only apply to new deployments.';

/** Guidance shown when the configured value is unusable. */
export const INVALID_API_BASE_URL_HINT =
  'VITE_API_BASE_URL is not an absolute http(s) origin (scheme, host, optional port only). ' +
  'The app will not guess an API location from it; fix the value in the hosting project and redeploy.';

/**
 * True when the configured API lives on a different origin than this page.
 * The browser session cookie is host-only, so callers use this only to explain
 * the sign-in limitation — never to skip authentication.
 */
export function isCrossOriginApi(baseUrl: string): boolean {
  if (!baseUrl) return false;
  try {
    const location = (globalThis as { location?: { origin?: string } }).location;
    if (!location?.origin) return false;
    return location.origin !== baseUrl;
  } catch {
    return false;
  }
}

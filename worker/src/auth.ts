import { createFreebuffAuth } from '@freebuff/auth';
import type { FreebuffAuth } from '@freebuff/auth';
import type { Env } from './env';
import { isValidHttpUrl, isValidOrigin } from './origins';

/**
 * Sign in with Freebuff (blueprint TASK 07).
 *
 * The OIDC contract is the documented @freebuff/auth SDK. Client IDs are
 * registered by the project OWNER (their Freebuff login) — this codebase
 * never invents clients, hand-rolls OAuth, or fakes a signed-in user.
 * Until FREEBUFF_CLIENT_ID / FREEBUFF_ISSUER / APP_ORIGIN are configured,
 * protected routes answer an honest `auth_not_configured` 503.
 */

// Mirrors the SDK's own client-id validation so a malformed value is an honest
// "not configured" 503, never a 401 or a half-initialised auth instance.
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export function authConfigured(env: Env): boolean {
  return Boolean(
    env.FREEBUFF_CLIENT_ID &&
      CLIENT_ID_PATTERN.test(env.FREEBUFF_CLIENT_ID) &&
      isValidHttpUrl(env.FREEBUFF_ISSUER) &&
      // `baseUrl` must be a canonical origin, never derived from the request.
      isValidOrigin(env.APP_ORIGIN)
  );
}

/** One auth instance per isolate (caches discovery and signing keys). */
let cached: { key: string; auth: FreebuffAuth } | undefined;

export function setupAuth(env: Env): FreebuffAuth {
  const key = `${env.FREEBUFF_CLIENT_ID}|${env.FREEBUFF_ISSUER}|${env.APP_ORIGIN}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      auth: createFreebuffAuth({
        clientId: env.FREEBUFF_CLIENT_ID!,
        issuer: env.FREEBUFF_ISSUER!,
        baseUrl: env.APP_ORIGIN!,
        allowInsecureLocalhost: Boolean(env.APP_ORIGIN && env.APP_ORIGIN.startsWith('http://'))
      })
    };
  }
  return cached.auth;
}

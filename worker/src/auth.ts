import { createFreebuffAuth } from '@freebuff/auth';
import type { FreebuffAuth } from '@freebuff/auth';
import type { Env } from './env';

/**
 * Sign in with Freebuff (blueprint TASK 07).
 *
 * The OIDC contract is the documented @freebuff/auth SDK. Client IDs are
 * registered by the project OWNER (their Freebuff login) — this codebase
 * never invents clients, hand-rolls OAuth, or fakes a signed-in user.
 * Until FREEBUFF_CLIENT_ID / FREEBUFF_ISSUER / APP_ORIGIN are configured,
 * protected routes answer an honest `auth_not_configured` 503.
 */

export function authConfigured(env: Env): boolean {
  return Boolean(env.FREEBUFF_CLIENT_ID && env.FREEBUFF_ISSUER && env.APP_ORIGIN);
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
        baseUrl: env.APP_ORIGIN!
      })
    };
  }
  return cached.auth;
}

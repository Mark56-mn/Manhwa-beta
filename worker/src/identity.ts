import type { Env } from './env';
import { authConfigured, setupAuth } from './auth';

/**
 * The single server-side identity path (TASK-IMPLEMENT-SHARED-FOUNDATION).
 *
 * Rules enforced here:
 *  - The caller is identified ONLY by the verified session/token, never by a
 *    request header, query parameter or body field sent by the browser.
 *  - When no auth client is configured, this returns null. Callers must answer
 *    an honest `auth_not_configured` 503 — never fall through as "allowed".
 *  - A missing, expired, malformed or unverifiable credential resolves to
 *    null (=> 401). Verification errors are not echoed to the client.
 *
 * `UserResolver` is the dependency-injection seam used by route tests. The
 * production default is `resolveFreebuffUser`; tests pass a double. There is
 * deliberately no environment flag that grants a user identity.
 */

export interface AuthenticatedUser {
  sub: string;
  name?: string | null;
}

export type UserResolver = (
  request: Request,
  env: Env
) => Promise<AuthenticatedUser | null>;

/**
 * Shape-check the SDK's verified claims. This does not verify a token; it only
 * guarantees the identity used for tenant lookups is a sane, non-empty `sub`.
 * Mirrors the SDK's own limits (string, ≤255 characters).
 */
export function normalizeVerifiedUser(value: unknown): AuthenticatedUser | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { sub?: unknown; name?: unknown };
  if (typeof candidate.sub !== 'string') return null;
  const sub = candidate.sub.trim();
  if (sub.length === 0 || sub.length > 255) return null;
  return { sub, name: typeof candidate.name === 'string' ? candidate.name : null };
}

/** Verify the current Sign in with Freebuff session/access token via the SDK. */
export async function resolveFreebuffUser(
  request: Request,
  env: Env
): Promise<AuthenticatedUser | null> {
  // No provider configuration, no identity — callers must answer 503, never
  // fall through to an anonymous request.
  if (!authConfigured(env)) return null;

  try {
    // The SDK reads only the HttpOnly session cookie and verifies the access
    // token's signature/issuer/audience/expiry. It never reads Authorization,
    // X-User-Id or any other caller-supplied identity.
    const user = await setupAuth(env).getUser(request);
    return normalizeVerifiedUser(user);
  } catch {
    // Invalid, expired or malformed credentials are indistinguishable to the
    // caller on purpose: both answer 401 without leaking verification detail.
    return null;
  }
}

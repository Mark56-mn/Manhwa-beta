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

/** Verify the current Sign in with Freebuff session/access token via the SDK. */
export async function resolveFreebuffUser(
  request: Request,
  env: Env
): Promise<AuthenticatedUser | null> {
  if (!authConfigured(env)) return null;

  try {
    const user = (await setupAuth(env).getUser(request)) as {
      sub?: unknown;
      name?: unknown;
    } | null;

    if (!user || typeof user.sub !== 'string') return null;
    const sub = user.sub.trim();
    if (sub.length === 0) return null;

    return { sub, name: typeof user.name === 'string' ? user.name : null };
  } catch {
    // Invalid, expired or malformed credentials are indistinguishable to the
    // caller on purpose: both answer 401 without leaking verification detail.
    return null;
  }
}

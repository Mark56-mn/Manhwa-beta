import type { Env } from './env';
import { authConfigured, verifySupabaseToken, type KeyResolver } from './auth';

/**
 * The single server-side identity path (TASK 11: Supabase Auth).
 *
 * Rules enforced here:
 *  - The caller is identified ONLY by a verified Supabase access token. There
 *    is no cookie, header, query parameter or body field that can name a user:
 *    `Authorization: Bearer` is the sole input, and it is verified.
 *  - When no Supabase project is configured, this returns null. Callers must
 *    answer an honest `auth_not_configured` 503 — never fall through as
 *    "allowed".
 *  - A missing, expired, malformed or unverifiable token resolves to null
 *    (=> 401). Verification errors are not echoed to the client.
 *
 * `UserResolver` is the dependency-injection seam used by route tests. The
 * production default is `resolveSupabaseUser`; tests pass a double. There is
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
 * Shape-check verified claims. This does not verify a token; it only
 * guarantees the identity used for tenant lookups is a sane, non-empty `sub`.
 */
export function normalizeVerifiedUser(value: unknown): AuthenticatedUser | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { sub?: unknown; name?: unknown };
  if (typeof candidate.sub !== 'string') return null;
  const sub = candidate.sub.trim();
  if (sub.length === 0 || sub.length > 255) return null;
  return { sub, name: typeof candidate.name === 'string' ? candidate.name : null };
}

/** An access token is ~1 KB; anything wildly larger is not a token. */
const MAX_TOKEN_LENGTH = 8 * 1024;

/**
 * Extract the bearer token from an Authorization header.
 *
 * Only the `Bearer` scheme is accepted, exactly one credential, no embedded
 * whitespace. Anything else is "no credential", never a partial parse.
 */
export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

/**
 * Verify the caller's Supabase access token.
 *
 * `resolveKeys` exists so tests can verify real signatures offline; production
 * callers omit it and get the project's JWKS resolver.
 */
export async function resolveSupabaseUser(
  request: Request,
  env: Env,
  resolveKeys?: KeyResolver
): Promise<AuthenticatedUser | null> {
  // No project configuration, no identity — callers must answer 503, never
  // fall through to an anonymous request.
  if (!authConfigured(env)) return null;

  // The bearer token is the only accepted input. `X-User-Id`,
  // `X-Organization-Id` and any other caller-supplied identity is ignored
  // entirely (and asserted absent by tests/auth-hardening.test.ts).
  const token = readBearerToken(request.headers.get('Authorization'));
  if (!token) return null;

  try {
    return normalizeVerifiedUser(await verifySupabaseToken(env, token, resolveKeys));
  } catch {
    // Invalid, expired or malformed credentials are indistinguishable to the
    // caller on purpose: both answer 401 without leaking verification detail.
    return null;
  }
}

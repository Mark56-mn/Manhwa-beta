import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from './env';
import { isValidOrigin } from './origins';

/**
 * Supabase Auth access-token verification (TASK 11).
 *
 * The browser owns the session: supabase-js stores it and sends it to this API
 * as `Authorization: Bearer <access token>`. This module is the ONLY place a
 * token is turned into an identity, and it verifies rather than trusts:
 *
 *  - The algorithm is read from the token header but never obeyed: only ES256 /
 *    RS256 (verified against the project's published JWKS) or HS256 (verified
 *    against an explicitly configured project secret) are accepted. `none` and
 *    every other algorithm are rejected, and an HMAC token is never verified
 *    with a public key.
 *  - `aud` must be `authenticated` and `exp`/`nbf` are enforced with a small
 *    clock tolerance. A missing `sub` is a rejection, never an anonymous user.
 *  - `iss` must be this project's issuer. Both spellings (`.../auth/v1` and
 *    `.../auth/v1/`) are accepted because Supabase has emitted both.
 *  - No secret is required at all for a modern project: ES256 tokens verify
 *    against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. `SUPABASE_JWT_SECRET`
 *    exists only for legacy HS256 projects.
 *  - Until `SUPABASE_URL` is a usable bare origin, every protected route
 *    answers an honest `auth_not_configured` 503 rather than pretending.
 *
 * `service_role` is never used here: verification only needs public keys, and a
 * service-role key would be a catastrophic thing to hold in this path.
 */

/** Supabase mints user access tokens with this audience. */
export const SUPABASE_AUDIENCE = 'authenticated';

const ASYMMETRIC_ALGORITHMS = ['ES256', 'RS256'];
const HMAC_ALGORITHMS = ['HS256'];
const CLOCK_TOLERANCE_SECONDS = 5;
const MAX_SUBJECT_LENGTH = 255;

/**
 * The project base URL, or null when it is not usable.
 *
 * A bare http(s) origin is required: a path, query, fragment or embedded
 * credentials would make the JWKS and token URLs silently wrong, so such a
 * value is treated as "not configured" instead of being patched up.
 */
export function supabaseBaseUrl(env: Env): string | null {
  const raw = (env.SUPABASE_URL ?? '').trim();
  if (raw.length === 0) return null;
  if (!isValidOrigin(raw)) return null;
  return raw.replace(/\/+$/, '');
}

/** True only when access tokens can actually be verified. */
export function authConfigured(env: Env): boolean {
  return supabaseBaseUrl(env) !== null;
}

/** This project's token issuer, e.g. `https://abcd.supabase.co/auth/v1`. */
export function supabaseIssuer(env: Env): string | null {
  const base = supabaseBaseUrl(env);
  return base ? `${base}/auth/v1` : null;
}

/**
 * Verification keys for one environment.
 *
 * `jwks` is the public key set (asymmetric tokens); `hmacSecret` is only ever
 * populated from an explicitly configured legacy secret. The resolver is a
 * seam so tests can verify real signatures offline without weakening
 * production: the default resolver is the only one the Worker uses.
 */
export interface VerificationKeys {
  jwks?: JWTVerifyGetKey;
  hmacSecret?: Uint8Array;
}

export type KeyResolver = (env: Env) => VerificationKeys | null | Promise<VerificationKeys | null>;

let remoteJwks: { url: string; keys: JWTVerifyGetKey } | undefined;

/** Default resolver: project JWKS (cached per isolate) plus an optional legacy secret. */
export const defaultKeyResolver: KeyResolver = (env) => {
  const base = supabaseBaseUrl(env);
  if (!base) return null;

  const keys: VerificationKeys = {};

  const secret = (env.SUPABASE_JWT_SECRET ?? '').trim();
  if (secret) keys.hmacSecret = new TextEncoder().encode(secret);

  const url = `${base}/auth/v1/.well-known/jwks.json`;
  // jose caches the fetched set and re-fetches when it sees an unknown `kid`
  // (key rotation), with its own cooldown to avoid hammering the project.
  if (!remoteJwks || remoteJwks.url !== url) {
    remoteJwks = { url, keys: createRemoteJWKSet(new URL(url)) };
  }
  keys.jwks = remoteJwks.keys;

  return keys;
};

/** Display name from verified claims. Never used as an identity key. */
function displayNameFrom(payload: Record<string, unknown>): string | null {
  const metadata = payload.user_metadata;
  if (typeof metadata !== 'object' || metadata === null) return null;
  const record = metadata as Record<string, unknown>;
  for (const key of ['name', 'full_name', 'preferred_username']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

export interface VerifiedToken {
  /** The Supabase `sub` — a stable UUID, the only tenant key. */
  sub: string;
  /** Cosmetic display name from `user_metadata`, if the user set one. */
  name: string | null;
}

/**
 * Verify a Supabase access token. Returns null for anything unverifiable —
 * expiry, wrong audience/issuer, tampering, an unknown or missing key, a
 * disallowed algorithm — with no detail echoed to the caller.
 */
export async function verifySupabaseToken(
  env: Env,
  token: string,
  resolveKeys: KeyResolver = defaultKeyResolver
): Promise<VerifiedToken | null> {
  const issuer = supabaseIssuer(env);
  if (!issuer) return null;
  if (typeof token !== 'string' || token.trim().length === 0) return null;

  let algorithm: string;
  try {
    algorithm = decodeProtectedHeader(token).alg ?? '';
  } catch {
    return null;
  }

  let key: JWTVerifyGetKey | Uint8Array;
  let algorithms: string[];

  if (algorithm === 'HS256') {
    const keys = await resolveKeys(env);
    // No configured secret means this project signs with ES256; an HS256 token
    // is then either forged or from a different issuer. Never fall back.
    if (!keys?.hmacSecret) return null;
    key = keys.hmacSecret;
    algorithms = HMAC_ALGORITHMS;
  } else if (ASYMMETRIC_ALGORITHMS.includes(algorithm)) {
    const keys = await resolveKeys(env);
    if (!keys?.jwks) return null;
    key = keys.jwks;
    algorithms = ASYMMETRIC_ALGORITHMS;
  } else {
    // `none`, HS384/HS512, or any algorithm this API does not expect.
    return null;
  }

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, key, {
      audience: SUPABASE_AUDIENCE,
      algorithms,
      clockTolerance: CLOCK_TOLERANCE_SECONDS
    });
    payload = verified.payload as unknown as Record<string, unknown>;
  } catch {
    return null;
  }

  const acceptedIssuers = new Set([issuer, `${issuer}/`]);
  if (typeof payload.iss !== 'string' || !acceptedIssuers.has(payload.iss)) return null;

  if (typeof payload.sub !== 'string') return null;
  const sub = payload.sub.trim();
  if (sub.length === 0 || sub.length > MAX_SUBJECT_LENGTH) return null;

  return { sub, name: displayNameFrom(payload) };
}

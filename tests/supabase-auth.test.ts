import { beforeAll, describe, expect, it } from 'bun:test';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey
} from 'jose';
import type { Env } from '../worker/src/env';
import { authConfigured, supabaseIssuer, verifySupabaseToken } from '../worker/src/auth';
import { readBearerToken, resolveSupabaseUser } from '../worker/src/identity';
import { app } from '../worker/src/index';

/**
 * Supabase access-token verification (TASK 11).
 *
 * Real signatures, real expiry and real tampering — no mocks of the crypto.
 * Asymmetric tokens are checked against an in-memory JWKS through the key
 * resolver seam; the route-level cases use a legacy HS256 secret so the default
 * resolver runs with no network at all.
 */

const SUPABASE_URL = 'https://project.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const ORIGIN = 'https://app.example';
const SUB = '3f2b1a44-9c1e-4d7a-8f10-2b6c5d7e9a01';
const SECRET = 'test-only-hs256-secret-value';

function env(overrides: Partial<Env> = {}): Env {
  return {
    SUPABASE_URL,
    APP_ORIGIN: ORIGIN,
    ALLOWED_ORIGINS: 'https://vercel.example',
    ...overrides
  };
}

let signKey: CryptoKey;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  signKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwks = createLocalJWKSet({ keys: [{ ...jwk, kid: 'key-1', alg: 'ES256', use: 'sig' }] });
});

const keys = () => ({ jwks });

interface TokenOptions {
  iss?: string;
  aud?: string;
  sub?: string | null;
  expiresIn?: number | string;
  metadata?: Record<string, unknown>;
}

async function esToken(options: TokenOptions = {}): Promise<string> {
  let token = new SignJWT({ user_metadata: options.metadata ?? { name: 'Ada' } })
    .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
    .setIssuer(options.iss ?? ISSUER)
    .setAudience(options.aud ?? 'authenticated')
    .setIssuedAt();

  if (options.sub !== null) token = token.setSubject(options.sub ?? SUB);
  return token.setExpirationTime(options.expiresIn ?? '1h').sign(signKey);
}

async function hsToken(options: { secret?: string; expiresIn?: number | string } = {}): Promise<string> {
  return new SignJWT({ user_metadata: { full_name: 'Grace Hopper' } })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setSubject(SUB)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(new TextEncoder().encode(options.secret ?? SECRET));
}

function base64url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unsignedToken(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  return `${header}.${base64url(JSON.stringify(payload))}.`;
}

describe('project configuration', () => {
  it('derives the issuer from a bare project origin', () => {
    expect(supabaseIssuer(env())).toBe(ISSUER);
    expect(supabaseIssuer(env({ SUPABASE_URL: `${SUPABASE_URL}/` }))).toBe(ISSUER);
    expect(authConfigured(env())).toBe(true);
  });

  it('is not configured when the URL is missing or not a bare origin', () => {
    expect(authConfigured({})).toBe(false);
    expect(authConfigured({ SUPABASE_URL: `${SUPABASE_URL}/auth/v1` })).toBe(false);
    expect(authConfigured({ SUPABASE_URL: 'not-a-url' })).toBe(false);
  });
});

describe('bearer parsing', () => {
  it('accepts exactly one Bearer credential', () => {
    expect(readBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(readBearerToken('bearer abc')).toBe('abc');
    expect(readBearerToken('  Bearer   abc  ')).toBe('abc');
  });

  it('rejects other schemes, empty values and multiple credentials', () => {
    for (const header of [null, '', 'abc', 'Basic abc', 'Bearer', 'Bearer  ', 'Bearer a b']) {
      expect(readBearerToken(header)).toBeNull();
    }
  });

  it('rejects an absurdly long value instead of parsing it', () => {
    expect(readBearerToken(`Bearer ${'a'.repeat(9000)}`)).toBeNull();
  });
});

describe('asymmetric verification', () => {
  it('verifies a well-formed token and maps a display name', async () => {
    await expect(verifySupabaseToken(env(), await esToken(), keys)).resolves.toEqual({
      sub: SUB,
      name: 'Ada'
    });
  });

  it('accepts an issuer with a trailing slash', async () => {
    const token = await esToken({ iss: `${ISSUER}/` });
    await expect(verifySupabaseToken(env(), token, keys)).resolves.toEqual({ sub: SUB, name: 'Ada' });
  });

  it('falls back to full_name, then to no name', async () => {
    await expect(
      verifySupabaseToken(env(), await esToken({ metadata: { full_name: 'Grace' } }), keys)
    ).resolves.toEqual({ sub: SUB, name: 'Grace' });
    await expect(
      verifySupabaseToken(env(), await esToken({ metadata: {} }), keys)
    ).resolves.toEqual({ sub: SUB, name: null });
  });

  it('rejects an expired token', async () => {
    await expect(verifySupabaseToken(env(), await esToken({ expiresIn: -60 }), keys)).resolves.toBeNull();
  });

  it('rejects the wrong audience and a foreign issuer', async () => {
    await expect(
      verifySupabaseToken(env(), await esToken({ aud: 'anon' }), keys)
    ).resolves.toBeNull();
    await expect(
      verifySupabaseToken(env(), await esToken({ iss: 'https://other.supabase.co/auth/v1' }), keys)
    ).resolves.toBeNull();
  });

  it('rejects a token with no subject', async () => {
    await expect(verifySupabaseToken(env(), await esToken({ sub: null }), keys)).resolves.toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await esToken();
    const [header, payload, signature] = token.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const tampered = base64url(JSON.stringify({ ...decoded, sub: 'attacker-sub' }));
    await expect(
      verifySupabaseToken(env(), `${header}.${tampered}.${signature}`, keys)
    ).resolves.toBeNull();
  });

  it('rejects alg: none even when the claims look perfect', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = unsignedToken({ sub: SUB, aud: 'authenticated', iss: ISSUER, exp: now + 600 });
    await expect(verifySupabaseToken(env(), token, keys)).resolves.toBeNull();
  });

  it('rejects an HS256 token when only a public key set is available', async () => {
    // The classic algorithm-confusion attempt: an HMAC token signed with a
    // string that was once public. No configured secret means no HMAC path.
    await expect(verifySupabaseToken(env(), await hsToken(), keys)).resolves.toBeNull();
  });

  it('rejects an unparseable token and a resolver that yields nothing', async () => {
    await expect(verifySupabaseToken(env(), 'not-a-jwt', keys)).resolves.toBeNull();
    await expect(verifySupabaseToken(env(), await esToken(), () => null)).resolves.toBeNull();
  });
});

describe('legacy HS256 projects', () => {
  it('verifies with an explicitly configured secret only', async () => {
    // Token signed with a different secret must not verify with this one.
    await expect(
      verifySupabaseToken(env(), await hsToken({ secret: 'another-secret' }), () => ({
        hmacSecret: new TextEncoder().encode(SECRET)
      }))
    ).resolves.toBeNull();

    await expect(
      verifySupabaseToken(env(), await hsToken(), () => ({
        hmacSecret: new TextEncoder().encode(SECRET)
      }))
    ).resolves.toEqual({ sub: SUB, name: 'Grace Hopper' });
  });
});

describe('identity resolution', () => {
  it('resolves only from a verified bearer token', async () => {
    const request = new Request(`${ORIGIN}/api/v1/me`, {
      headers: { Authorization: `Bearer ${await esToken()}` }
    });
    await expect(resolveSupabaseUser(request, env(), keys)).resolves.toEqual({
      sub: SUB,
      name: 'Ada'
    });
  });

  it('ignores identity headers entirely', async () => {
    const request = new Request(`${ORIGIN}/api/v1/me`, {
      headers: { 'X-User-Id': 'someone-else', 'X-Organization-Id': 'org-x' }
    });
    await expect(resolveSupabaseUser(request, env(), keys)).resolves.toBeNull();
  });
});

describe('/api/v1/me end to end', () => {
  // The default resolver runs here: a configured HS256 secret needs no fetch.
  const configured = () => env({ SUPABASE_JWT_SECRET: SECRET });

  it('answers the verified subject and name', async () => {
    const response = await app.request(
      'https://api.example/api/v1/me',
      { headers: { Authorization: `Bearer ${await hsToken()}` } },
      configured()
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ sub: SUB, name: 'Grace Hopper' });
  });

  it('answers 401 for a missing, malformed, expired or wrongly-signed token', async () => {
    const cases: Array<Record<string, string>> = [
      {},
      { Authorization: 'garbage' },
      { Authorization: `Bearer ${await hsToken({ expiresIn: -60 })}` },
      { Authorization: `Bearer ${await hsToken({ secret: 'not-the-project-secret' })}` }
    ];
    for (const headers of cases) {
      const response = await app.request('https://api.example/api/v1/me', { headers }, configured());
      expect(response.status).toBe(401);
      expect((await response.json()).error).toBe('unauthorized');
    }
  });

  it('answers 503 auth_not_configured when SUPABASE_URL is absent', async () => {
    const response = await app.request(
      'https://api.example/api/v1/me',
      { headers: { Authorization: `Bearer ${await hsToken()}` } },
      { APP_ORIGIN: ORIGIN, SUPABASE_JWT_SECRET: SECRET }
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('auth_not_configured');
  });
});

describe('CORS advertises the bearer header', () => {
  it('lists Authorization in the preflight response', async () => {
    const response = await app.request(
      'https://api.example/api/v1/projects',
      {
        method: 'OPTIONS',
        headers: {
          Origin: ORIGIN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type'
        }
      },
      env()
    );
    expect(response.status).toBe(204);
    const allowed = (response.headers.get('Access-Control-Allow-Headers') ?? '').toLowerCase();
    expect(allowed).toContain('authorization');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('still refuses a foreign origin', async () => {
    const response = await app.request(
      'https://api.example/api/v1/projects',
      { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } },
      env()
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

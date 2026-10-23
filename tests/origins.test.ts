import { describe, expect, it } from 'bun:test';
import type { Env } from '../worker/src/env';
import { app } from '../worker/src/index';
import {
  allowedOrigins,
  isAllowedMutationOrigin,
  isAllowedOrigin,
  preflightHeadersFor
} from '../worker/src/origins';

/**
 * CORS policy tests (TASK-IMPLEMENT-SHARED-FOUNDATION).
 *
 * The second host needs credentialed cross-origin access. These tests assert
 * the policy can never widen to a wildcard or a suffix match.
 */

const APP_ORIGIN = 'https://app.example';
const SECOND_HOST = 'https://vercel.example';

const env: Env = { APP_ORIGIN, ALLOWED_ORIGINS: SECOND_HOST };

describe('origin parsing', () => {
  it('includes APP_ORIGIN and ALLOWED_ORIGINS, normalized and deduplicated', () => {
    expect(
      allowedOrigins({
        APP_ORIGIN: 'https://app.example/',
        ALLOWED_ORIGINS: ' https://vercel.example , https://app.example '
      })
    ).toEqual([APP_ORIGIN, SECOND_HOST]);
  });

  it('ignores wildcards, paths, non-http schemes and embedded credentials', () => {
    expect(
      allowedOrigins({
        APP_ORIGIN,
        ALLOWED_ORIGINS: '*, https://vercel.example/path, ftp://files.example, https://u:p@evil.example'
      })
    ).toEqual([APP_ORIGIN]);
  });

  it('matches exact origins only (no suffix or prefix matching)', () => {
    expect(isAllowedOrigin(APP_ORIGIN, env)).toBe(true);
    expect(isAllowedOrigin('https://app.example.evil', env)).toBe(false);
    expect(isAllowedOrigin('https://evil.app.example', env)).toBe(false);
    expect(isAllowedOrigin('http://app.example', env)).toBe(false);
    expect(isAllowedOrigin(undefined, env)).toBe(false);
  });

  it('requires an allow-listed Origin for mutations', () => {
    expect(isAllowedMutationOrigin(new Request('https://api.example/x'), env)).toBe(false);
    expect(
      isAllowedMutationOrigin(
        new Request('https://api.example/x', { headers: { Origin: SECOND_HOST } }),
        env
      )
    ).toBe(true);
    expect(
      isAllowedMutationOrigin(
        new Request('https://api.example/x', { headers: { Origin: 'https://evil.example' } }),
        env
      )
    ).toBe(false);
  });

  it('never returns a wildcard header', () => {
    expect(preflightHeadersFor(APP_ORIGIN, env)?.['Access-Control-Allow-Origin']).toBe(APP_ORIGIN);
    expect(preflightHeadersFor('*', env)).toBeNull();
  });
});

describe('preflight through the worker', () => {
  const preflight = (origin: string) =>
    app.request(
      'https://api.example/api/v1/projects',
      {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type'
        }
      },
      env
    );

  it('answers 204 with the exact origin and credentials for an allowed origin', async () => {
    const res = await preflight(SECOND_HOST);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SECOND_HOST);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Vary')).toContain('Origin');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Project-Id');
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });

  it('rejects a preflight from an unlisted origin without CORS headers', async () => {
    const res = await preflight('https://evil.example');
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('rejects a literal wildcard origin', async () => {
    const res = await preflight('*');
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('actual responses through the worker', () => {
  it('adds the exact origin header for an allowed cross-origin GET', async () => {
    const res = await app.request(
      'https://api.example/healthz',
      { headers: { Origin: SECOND_HOST } },
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SECOND_HOST);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('emits no CORS allowance for an unlisted origin', async () => {
    const res = await app.request(
      'https://api.example/healthz',
      { headers: { Origin: 'https://evil.example' } },
      env
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

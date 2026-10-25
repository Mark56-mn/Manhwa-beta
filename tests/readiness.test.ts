import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from '../worker/src/env';
import { app } from '../worker/src/index';
import { createSqliteD1 } from './helpers/d1';
import { MemoryR2Bucket } from './helpers/r2';

/**
 * Backend readiness contract (TASK 06).
 *
 * Health, readiness and CORS are how a frontend (and a human) decide whether a
 * deployment is usable. These tests pin the observed behaviour of the real
 * Hono app: liveness must not depend on bindings, readiness must gate on D1 and
 * report every other dependency honestly, and no configured secret or origin
 * value may appear in a response.
 */

const MIGRATIONS = [
  '0001_init_tenancy.sql',
  '0002_assets_and_replication.sql',
  '0003_story_generation.sql'
].map((file) => readFileSync(join(import.meta.dir, '..', 'migrations', file), 'utf8'));

const APP_ORIGIN = 'https://app.example';
const VERCEL_ORIGIN = 'https://manhwa-beta-frontend.vercel.app';

function migratedD1() {
  const db = new Database(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  return createSqliteD1(db);
}

function baseEnv(overrides: Env = {}): Env {
  return {
    APP_ORIGIN,
    ALLOWED_ORIGINS: VERCEL_ORIGIN,
    FREEBUFF_CLIENT_ID: 'client-abc123',
    FREEBUFF_ISSUER: 'https://freebuff.example/oidc',
    ...overrides
  };
}

async function json(response: Response): Promise<any> {
  return response.json();
}

describe('liveness never depends on configuration', () => {
  it('answers 200 with no bindings at all', async () => {
    const response = await app.request('https://api.example/healthz', {}, {} as Env);
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: 'ok' });
  });

  it('reports the service identity and its real route set', async () => {
    const response = await app.request('https://api.example/', {}, baseEnv());
    const body = await json(response);
    expect(response.status).toBe(200);
    expect(body.service).toBe('manhwa-studio-api');
    expect(body.routes).toContain('/api/v1/projects');
    expect(body.routes).toContain('/api/v1/assets/*');
  });
});

describe('readiness reports observed dependency state', () => {
  it('is 503 and names the missing database when no D1 binding is attached', async () => {
    const response = await app.request('https://api.example/readyz', {}, baseEnv());
    expect(response.status).toBe(503);
    const body = await json(response);
    expect(body.status).toBe('degraded');
    expect(body.checks.d1.status).toBe('error');
    expect(body.checks.d1.detail).toContain('No D1 binding');
  });

  it('is 200 ready only after a real query succeeds against D1', async () => {
    const response = await app.request(
      'https://api.example/readyz',
      {},
      baseEnv({ DB: migratedD1() })
    );
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.status).toBe('ready');
    expect(body.checks.d1).toEqual({ status: 'ok', detail: 'D1 binding answered SELECT 1.' });
  });

  it('is 503 when the database rejects the probe query', async () => {
    const failing = {
      prepare() {
        throw new Error('D1 unavailable');
      }
    };
    const response = await app.request(
      'https://api.example/readyz',
      {},
      baseEnv({ DB: failing as unknown as Env['DB'] })
    );
    expect(response.status).toBe(503);
    const body = await json(response);
    expect(body.checks.d1.status).toBe('error');
    expect(body.checks.d1.detail).toBe('D1 query failed.');
  });

  it('reports R2 and auth as not_configured rather than pretending they are ready', async () => {
    const response = await app.request(
      'https://api.example/readyz',
      {},
      { DB: migratedD1(), APP_ORIGIN, ALLOWED_ORIGINS: VERCEL_ORIGIN }
    );
    const body = await json(response);
    expect(body.checks.r2.status).toBe('not_configured');
    expect(body.checks.auth.status).toBe('not_configured');
    expect(body.checks.origins.status).toBe('ok');
  });

  it('reports an attached R2 bucket as ok', async () => {
    const response = await app.request(
      'https://api.example/readyz',
      {},
      baseEnv({ DB: migratedD1(), FILES: new MemoryR2Bucket() })
    );
    const body = await json(response);
    expect(body.checks.r2.status).toBe('ok');
  });

  it('reports not_configured rather than ready when no origin is valid', async () => {
    const response = await app.request(
      'https://api.example/readyz',
      {},
      { DB: migratedD1(), APP_ORIGIN: 'https://app.example/path', ALLOWED_ORIGINS: '*' }
    );
    const body = await json(response);
    expect(body.checks.origins.status).toBe('not_configured');
    expect(body.checks.auth.status).toBe('not_configured');
  });
});

describe('readiness discloses state, never values', () => {
  const SECRETS = {
    GEMINI_API_KEY: 'AIza-not-a-real-key-000000000000',
    GEMINI_MODEL: 'model-name-that-is-config',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-value-do-not-echo',
    SUPABASE_URL: 'https://project.supabase.co'
  };

  it('counts allowed origins instead of printing them', async () => {
    const response = await app.request(
      'https://api.example/readyz',
      {},
      baseEnv({ DB: migratedD1(), ...SECRETS })
    );
    const text = await response.text();
    expect(text).toContain('2 exact origin(s) allowed.');
    expect(text).not.toContain(APP_ORIGIN);
    expect(text).not.toContain(VERCEL_ORIGIN);
  });

  it('never echoes a provider key, model, Supabase value or client id', async () => {
    const response = await app.request(
      'https://api.example/readyz',
      {},
      baseEnv({ DB: migratedD1(), ...SECRETS })
    );
    const text = await response.text();
    for (const value of [...Object.values(SECRETS), 'client-abc123']) {
      expect(text).not.toContain(value);
    }
  });
});

describe('CORS for a separately hosted frontend', () => {
  const withOrigin = (path: string, origin: string, method = 'GET') =>
    app.request(`https://api.example${path}`, { method, headers: { Origin: origin } }, baseEnv({
      DB: migratedD1()
    }));

  it('allows the configured frontend origin with credentials on a read', async () => {
    const response = await withOrigin('/healthz', VERCEL_ORIGIN);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(VERCEL_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('answers the preflight a browser sends before a JSON POST', async () => {
    const response = await app.request(
      'https://api.example/api/v1/projects',
      {
        method: 'OPTIONS',
        headers: {
          Origin: VERCEL_ORIGIN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type'
        }
      },
      baseEnv({ DB: migratedD1() })
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(VERCEL_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  it('never emits a wildcard, even when a wildcard is configured', async () => {
    const response = await app.request(
      'https://api.example/healthz',
      { headers: { Origin: VERCEL_ORIGIN } },
      { APP_ORIGIN, ALLOWED_ORIGINS: '*' }
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('refuses a foreign preflight outright', async () => {
    const response = await withOrigin('/api/v1/projects', 'https://evil.example', 'OPTIONS');
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

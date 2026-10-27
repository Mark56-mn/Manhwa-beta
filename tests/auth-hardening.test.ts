import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Env } from '../worker/src/env';
import type { AuthenticatedUser } from '../worker/src/identity';
import { normalizeVerifiedUser, resolveFreebuffUser } from '../worker/src/identity';
import { authConfigured } from '../worker/src/auth';
import { createProjectsApp } from '../worker/src/projects';
import { createAssetApp } from '../worker/src/assets';
import { isAllowedMutationOrigin } from '../worker/src/origins';
import { app } from '../worker/src/index';
import { createSqliteD1 } from './helpers/d1';
import { MemoryR2Bucket } from './helpers/r2';

/**
 * Authentication and tenant-isolation hardening (TASK 03).
 *
 * Everything here runs against the real Hono routes and the real migrations in
 * SQLite. Identity for the route-level cases is injected (route-level tests),
 * while the identity module itself is exercised directly. No network is used:
 * a request without a parseable session cookie short-circuits before the SDK
 * fetches discovery/JWKS.
 */

const MIGRATIONS = [
  '0001_init_tenancy.sql',
  '0002_assets_and_replication.sql',
  '0003_story_generation.sql'
].map((file) =>
  readFileSync(join(import.meta.dir, '..', 'db', 'migrations', file), 'utf8')
);

const APP_ORIGIN = 'https://app.example';
const SECOND_HOST = 'https://vercel.example';
const ASSET_A_KEY = 'org/org-a/proj/p-a/asset/asset-a/asset-a.png';
const ASSET_B_KEY = 'org/org-b/proj/p-b/asset/asset-b/asset-b.png';

let db: Database;

function freshDb(): Database {
  const database = new Database(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  for (const sql of MIGRATIONS) database.exec(sql);
  database.run("INSERT INTO organizations (id, name, slug) VALUES ('org-a', 'Org A', 'org-a')");
  database.run("INSERT INTO organizations (id, name, slug) VALUES ('org-b', 'Org B', 'org-b')");
  database.run("INSERT INTO users (id, display_name) VALUES ('sub-a', 'User A')");
  database.run("INSERT INTO users (id, display_name) VALUES ('sub-b', 'User B')");
  database.run(
    "INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m-a', 'org-a', 'sub-a', 'owner')"
  );
  database.run(
    "INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m-b', 'org-b', 'sub-b', 'member')"
  );
  database.run(
    "INSERT INTO projects (id, organization_id, title, genre, created_by_sub) VALUES ('p-a', 'org-a', 'A series', 'Action', 'sub-a')"
  );
  database.run(
    "INSERT INTO projects (id, organization_id, title, genre, created_by_sub) VALUES ('p-b', 'org-b', 'B series', 'Drama', 'sub-b')"
  );
  database.run(
    `INSERT INTO assets (id, organization_id, project_id, r2_key, filename, content_type, size, etag, created_by_sub)
     VALUES ('asset-a', 'org-a', 'p-a', '${ASSET_A_KEY}', 'a.png', 'image/png', 10, 'e-a', 'sub-a')`
  );
  database.run(
    `INSERT INTO assets (id, organization_id, project_id, r2_key, filename, content_type, size, etag, created_by_sub)
     VALUES ('asset-b', 'org-b', 'p-b', '${ASSET_B_KEY}', 'b.png', 'image/png', 10, 'e-b', 'sub-b')`
  );
  return database;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  const files = new MemoryR2Bucket();
  files.objects.set(ASSET_A_KEY, { body: null, size: 10, etag: 'e-a', contentType: 'image/png' });
  files.objects.set(ASSET_B_KEY, { body: null, size: 10, etag: 'e-b', contentType: 'image/png' });
  return {
    DB: createSqliteD1(db),
    FILES: files as unknown as Env['FILES'],
    FREEBUFF_CLIENT_ID: 'client-test',
    FREEBUFF_ISSUER: 'https://issuer.test',
    APP_ORIGIN,
    ALLOWED_ORIGINS: SECOND_HOST,
    ...overrides
  };
}

const userA: AuthenticatedUser = { sub: 'sub-a', name: 'User A' };
const projectsAsA = () => createProjectsApp({ resolveUser: async () => userA });
const assetsAsA = () => createAssetApp({ resolveUser: async () => userA });

beforeEach(() => {
  db = freshDb();
});

describe('verified identity normalization', () => {
  it('accepts a sane verified sub and drops a non-string name', () => {
    expect(normalizeVerifiedUser({ sub: 'sub-a', name: 'Ada' })).toEqual({
      sub: 'sub-a',
      name: 'Ada'
    });
    expect(normalizeVerifiedUser({ sub: '  sub-a  ', name: 42 })).toEqual({
      sub: 'sub-a',
      name: null
    });
  });

  it('rejects missing, empty, non-string and over-long subjects', () => {
    for (const value of [
      null,
      undefined,
      {},
      { sub: '' },
      { sub: '   ' },
      { sub: 123 },
      { sub: { id: 'sub-a' } },
      { sub: 'x'.repeat(256) }
    ]) {
      expect(normalizeVerifiedUser(value)).toBeNull();
    }
  });
});

describe('configuration is valid before auth is reported configured', () => {
  const base: Partial<Env> = {
    FREEBUFF_CLIENT_ID: 'client-test',
    FREEBUFF_ISSUER: 'https://freebuff.com/oidc',
    APP_ORIGIN
  };

  it('accepts a normal public configuration (issuer may carry a path)', () => {
    expect(authConfigured(base as Env)).toBe(true);
  });

  it('rejects a malformed client id, a non-URL issuer, or a non-origin APP_ORIGIN', () => {
    expect(authConfigured({ ...base, FREEBUFF_CLIENT_ID: 'not a client id!' } as Env)).toBe(false);
    expect(authConfigured({ ...base, FREEBUFF_ISSUER: 'not-a-url' } as Env)).toBe(false);
    expect(authConfigured({ ...base, APP_ORIGIN: 'https://app.example/path' } as Env)).toBe(false);
    expect(authConfigured({ ...base, APP_ORIGIN: 'null' } as Env)).toBe(false);
  });
});

describe('no caller-supplied identity is ever accepted', () => {
  const spoofed = () =>
    new Request(`${APP_ORIGIN}/api/v1/me`, {
      headers: {
        Authorization: 'Bearer forged-supabase-or-freebuff-token',
        'X-User-Id': 'sub-b',
        'X-Organization-Id': 'org-b',
        Cookie: '__Host-freebuff_session=forged-session-value'
      }
    });

  it('returns null when no client is configured, regardless of headers', async () => {
    const env = makeEnv();
    Reflect.deleteProperty(env, 'FREEBUFF_CLIENT_ID');
    await expect(resolveFreebuffUser(spoofed(), env)).resolves.toBeNull();
  });

  it('returns null for a configured deployment without a session cookie', async () => {
    await expect(resolveFreebuffUser(spoofed(), makeEnv())).resolves.toBeNull();
  });

  it('returns null for a malformed session cookie (no fallback to headers)', async () => {
    const env = makeEnv();
    const request = new Request(`${APP_ORIGIN}/api/v1/me`, {
      headers: {
        Cookie: '__Host-freebuff_session=garbage',
        'X-User-Id': 'sub-b'
      }
    });
    await expect(resolveFreebuffUser(request, env)).resolves.toBeNull();
  });
});

describe('every protected route rejects a signed-out caller', () => {
  const cases: Array<{ label: string; path: string; init?: RequestInit; head?: boolean }> = [
    { label: 'me', path: '/api/v1/me' },
    { label: 'project list', path: '/api/v1/projects' },
    { label: 'project read', path: '/api/v1/projects/p-a' },
    {
      label: 'project create',
      path: '/api/v1/projects',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({ title: 'Nope' })
      }
    },
    {
      label: 'project update',
      path: '/api/v1/projects/p-a',
      init: {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({ title: 'Nope' })
      }
    },
    {
      label: 'project delete',
      path: '/api/v1/projects/p-a',
      init: { method: 'DELETE', headers: { Origin: APP_ORIGIN } }
    },
    { label: 'asset list', path: '/api/v1/assets' },
    { label: 'asset read', path: '/api/v1/assets/asset-a' },
    { label: 'asset head', path: '/api/v1/assets/asset-a', init: { method: 'HEAD' }, head: true },
    {
      label: 'asset create',
      path: '/api/v1/assets',
      init: {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain', Origin: APP_ORIGIN },
        body: 'x'
      }
    },
    {
      label: 'asset delete',
      path: '/api/v1/assets/asset-a',
      init: { method: 'DELETE', headers: { Origin: APP_ORIGIN } }
    }
  ];

  for (const testCase of cases) {
    it(`${testCase.label} -> 401 without a session`, async () => {
      const response = await app.request(
        `https://api.example${testCase.path}`,
        testCase.init ?? {},
        makeEnv()
      );
      expect(response.status).toBe(401);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      if (testCase.head) {
        expect(await response.text()).toBe('');
      } else {
        expect((await response.json()).error).toBe('unauthorized');
      }
    });
  }
});

describe('cross-tenant isolation and ID guessing', () => {
  const mutation = (method: string, body?: unknown) => ({
    method,
    headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  it('cannot read, modify or delete another tenant project by id', async () => {
    const projectApp = projectsAsA();
    const env = makeEnv();

    for (const [method, body] of [
      ['PATCH', { title: 'Hijacked' }],
      ['DELETE', undefined]
    ] as const) {
      const response = await projectApp.request(
        `https://app.example/api/v1/projects/p-b`,
        mutation(method, body),
        env
      );
      expect(response.status).toBe(404);
    }

    const guessedRead = await projectApp.request('https://app.example/api/v1/projects/p-b', {}, env);
    expect(guessedRead.status).toBe(404);
    expect(
      db.query("SELECT title, organization_id FROM projects WHERE id = 'p-b'").get()
    ).toEqual({ title: 'B series', organization_id: 'org-b' });
  });

  it('returns 404 for a guessed project id', async () => {
    const response = await projectsAsA().request(
      'https://app.example/api/v1/projects/proj-00000000-0000-0000-0000-000000000000',
      {},
      makeEnv()
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('not_found');
  });

  it('rejects ownership fields on update and changes nothing', async () => {
    for (const field of ['organization_id', 'created_by_sub']) {
      const response = await projectsAsA().request(
        'https://app.example/api/v1/projects/p-a',
        mutation('PATCH', { title: 'Should not apply', [field]: 'org-b' }),
        makeEnv()
      );
      expect(response.status).toBe(400);
      expect((await response.json()).detail).toContain(field);
    }
    expect(db.query("SELECT title, organization_id, created_by_sub FROM projects WHERE id = 'p-a'").get()).toEqual({
      title: 'A series',
      organization_id: 'org-a',
      created_by_sub: 'sub-a'
    });
  });

  it('cannot read or delete another tenant asset; guessed ids are 404', async () => {
    const assetApp = assetsAsA();
    const env = makeEnv();

    const readOther = await assetApp.request('https://app.example/api/v1/assets/asset-b', {}, env);
    expect(readOther.status).toBe(403);
    expect((await readOther.json()).error).toBe('forbidden');

    const deleteOther = await assetApp.request(
      'https://app.example/api/v1/assets/asset-b',
      { method: 'DELETE', headers: { Origin: APP_ORIGIN } },
      env
    );
    expect(deleteOther.status).toBe(403);
    expect(db.query("SELECT COUNT(*) AS n FROM assets WHERE id = 'asset-b'").get()).toEqual({ n: 1 });
    expect((env.FILES as MemoryR2Bucket).objects.has(ASSET_B_KEY)).toBe(true);

    const unknown = await assetApp.request('https://app.example/api/v1/assets/asset-unknown', {}, env);
    expect(unknown.status).toBe(404);
  });

  it('refuses to attach an asset to another tenant project', async () => {
    const response = await assetsAsA().request(
      'https://app.example/api/v1/assets',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain',
          'X-Project-Id': 'p-b',
          Origin: APP_ORIGIN
        },
        body: 'x'
      },
      makeEnv()
    );
    expect(response.status).toBe(400);
    expect((await response.json()).detail).toContain('Project not found in your organization');
  });
});

describe('CSRF / mutation-origin guard', () => {
  it('rejects a missing Origin from a non-browser caller', () => {
    expect(isAllowedMutationOrigin(new Request('https://api.example/x'), makeEnv())).toBe(false);
  });

  it('rejects Origin: null from a cross-site context', () => {
    const request = new Request(`${APP_ORIGIN}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Origin': 'null', 'Sec-Fetch-Site': 'cross-site' }
    });
    expect(isAllowedMutationOrigin(request, makeEnv())).toBe(false);
  });

  it('accepts Origin: null from a same-origin no-referrer page', () => {
    const request = new Request(`${APP_ORIGIN}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Origin': 'null', 'Sec-Fetch-Site': 'same-origin' }
    });
    expect(isAllowedMutationOrigin(request, makeEnv())).toBe(true);
  });

  it('accepts an absent Origin with Sec-Fetch-Site: same-origin on an allowed host', () => {
    const request = new Request(`${SECOND_HOST}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'same-origin' }
    });
    expect(isAllowedMutationOrigin(request, makeEnv())).toBe(true);
  });

  it('does not accept same-origin claims when the API host is not allow-listed', () => {
    const request = new Request('https://api.example/api/v1/projects', {
      method: 'POST',
      headers: { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' }
    });
    expect(isAllowedMutationOrigin(request, makeEnv())).toBe(false);
  });

  it('an unlisted concrete Origin always wins over Sec-Fetch-Site', () => {
    const request = new Request(`${APP_ORIGIN}/api/v1/projects`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' }
    });
    expect(isAllowedMutationOrigin(request, makeEnv())).toBe(false);
  });

  it('allows the no-referrer flow through the route without granting a user', async () => {
    const response = await projectsAsA().request(
      `${APP_ORIGIN}/api/v1/projects`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'null', 'Sec-Fetch-Site': 'same-origin' },
        body: JSON.stringify({ title: 'No-referrer create' })
      },
      makeEnv()
    );
    expect(response.status).toBe(201);
  });
});

describe('CORS and preflight never bypass authorization', () => {
  it('carries the exact origin and credentials on a 401', async () => {
    const response = await app.request(
      'https://api.example/api/v1/me',
      { headers: { Origin: APP_ORIGIN } },
      makeEnv()
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('does not add CORS headers for an unlisted origin, even on 401', async () => {
    const response = await app.request(
      'https://api.example/api/v1/me',
      { headers: { Origin: 'https://evil.example' } },
      makeEnv()
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    // Origin-dependent refusals must still be partitioned by caches.
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('rejects a foreign origin before evaluating the session (403, not 401)', async () => {
    const response = await app.request(
      'https://api.example/api/v1/projects',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
        body: JSON.stringify({ title: 'Nope' })
      },
      makeEnv()
    );
    expect(response.status).toBe(403);
  });

  it('answers a preflight before any route handler runs', async () => {
    const unconfigured = makeEnv();
    Reflect.deleteProperty(unconfigured, 'FREEBUFF_CLIENT_ID');
    const response = await app.request(
      'https://api.example/api/v1/projects',
      {
        method: 'OPTIONS',
        headers: {
          Origin: SECOND_HOST,
          'Access-Control-Request-Method': 'POST'
        }
      },
      unconfigured
    );
    // A handler would have answered 503 auth_not_configured.
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(SECOND_HOST);
  });
});

describe('auth route fallback is truthful', () => {
  it('answers 503 auth_not_configured when no client exists', async () => {
    const env = makeEnv();
    Reflect.deleteProperty(env, 'FREEBUFF_CLIENT_ID');
    const response = await app.request('https://api.example/auth/freebuff/signin', {}, env);
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('auth_not_configured');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('answers 404 for an unknown auth path when a client is configured', async () => {
    const response = await app.request('https://api.example/auth/freebuff/login', {}, makeEnv());
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('not_found');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('readiness reports configuration without leaking origins', () => {
  it('reports auth, origins and R2 state truthfully', async () => {
    const env = makeEnv({ DB: createSqliteD1(new Database(':memory:')) });
    const response = await app.request('https://api.example/readyz', {}, env);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.checks.auth.status).toBe('ok');
    expect(json.checks.origins).toEqual({ status: 'ok', detail: '2 exact origin(s) allowed.' });
    expect(json.checks.r2.detail).toBe('R2 binding attached.');
    expect(JSON.stringify(json)).not.toContain('app.example');
  });

  it('reports not configured when no origin is valid', async () => {
    const env = makeEnv({
      DB: createSqliteD1(new Database(':memory:')),
      APP_ORIGIN: 'https://app.example/path',
      ALLOWED_ORIGINS: '*'
    });
    const response = await app.request('https://api.example/readyz', {}, env);
    const json = await response.json();
    expect(json.checks.origins.status).toBe('not_configured');
    expect(json.checks.auth.status).toBe('not_configured');
  });
});

describe('static guards against identity and CSRF regressions', () => {
  const ROOT = join(import.meta.dir, '..');

  function collect(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) collect(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  const workerSources = collect(join(ROOT, 'worker'))
    .map((path) => ({ rel: relative(ROOT, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') }))
    .filter((file) => !file.rel.startsWith('worker/node_modules'));
  const appSources = collect(join(ROOT, 'src')).map((path) => ({
    rel: relative(ROOT, path).replaceAll('\\', '/'),
    text: readFileSync(path, 'utf8')
  }));

  it('contains no test-only identity override or header-derived identity', () => {
    const forbidden = [
      /AUTH_USER_OVERRIDE/,
      /headers\s*\.\s*get\(\s*['"]authorization['"]/i,
      /headers\s*\.\s*get\(\s*['"]x-(?:user|organization)-id['"]/i
    ];
    for (const pattern of forbidden) {
      const hits = workerSources.filter((file) => pattern.test(file.text)).map((file) => file.rel);
      expect(hits).toEqual([]);
    }

    // The identity module must not inspect request headers at all; the SDK
    // reads its own HttpOnly cookie internally.
    const identity = workerSources.find((file) => file.rel === 'worker/src/identity.ts');
    if (!identity) throw new Error('identity module missing');
    expect(identity.text).not.toMatch(/headers/);
  });

  it('does not mix a second identity provider into the identity module', () => {
    const identity = workerSources.find((file) => file.rel === 'worker/src/identity.ts');
    if (!identity) throw new Error('identity module missing');
    expect(identity.text.toLowerCase()).not.toContain('supabase');
    expect(identity.text).not.toContain('jwt');
  });

  it('never sets cookies or reads them in application code', () => {
    const setCookie = workerSources
      .filter((file) => /set-cookie/i.test(file.text))
      .map((file) => file.rel);
    expect(setCookie).toEqual([]);
    const documentCookie = appSources.filter((file) => /document\.cookie/.test(file.text)).map((file) => file.rel);
    expect(documentCookie).toEqual([]);
  });

  it('never stores a session or token in browser storage', () => {
    const suspicious = appSources
      .filter((file) => /(localStorage|sessionStorage)[^\n]*(token|session|cookie|jwt)/i.test(file.text))
      .map((file) => file.rel);
    expect(suspicious).toEqual([]);
  });
});

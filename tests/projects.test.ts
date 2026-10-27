import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from '../worker/src/env';
import type { AuthenticatedUser } from '../worker/src/identity';
import { createProjectsApp } from '../worker/src/projects';
import { createAssetApp } from '../worker/src/assets';
import { createSqliteD1 } from './helpers/d1';
import { MemoryR2Bucket } from './helpers/r2';

/**
 * Tenant isolation for the shared foundation (TASK-IMPLEMENT-SHARED-FOUNDATION).
 *
 * Every request runs against the REAL migration files via SQLite, through the
 * same Hono route code production uses. Identity is injected (no network), so
 * the tests prove authorization logic — not the OIDC provider itself.
 */

const MIGRATION_FILES = [
  '0001_init_tenancy.sql',
  '0002_assets_and_replication.sql',
  '0003_story_generation.sql'
];

function loadMigrations(): string[] {
  return MIGRATION_FILES.map((file) =>
    readFileSync(join(import.meta.dir, '..', 'db', 'migrations', file), 'utf8')
  );
}

const APP_ORIGIN = 'https://app.example';
const SECOND_HOST = 'https://vercel.example';

let db: Database;

function seed(): void {
  db.run("INSERT INTO organizations (id, name, slug) VALUES ('org-a', 'Org A', 'org-a')");
  db.run("INSERT INTO organizations (id, name, slug) VALUES ('org-b', 'Org B', 'org-b')");
  db.run("INSERT INTO users (id, display_name) VALUES ('sub-a', 'User A')");
  db.run("INSERT INTO users (id, display_name) VALUES ('sub-b', 'User B')");
  db.run(
    "INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m-a', 'org-a', 'sub-a', 'owner')"
  );
  db.run(
    "INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m-b', 'org-b', 'sub-b', 'member')"
  );
  db.run(
    "INSERT INTO projects (id, organization_id, title, genre, created_by_sub) VALUES ('p-a', 'org-a', 'A series', 'Action', 'sub-a')"
  );
  db.run(
    "INSERT INTO projects (id, organization_id, title, genre, created_by_sub) VALUES ('p-b', 'org-b', 'B series', 'Drama', 'sub-b')"
  );
  db.run(
    `INSERT INTO assets (id, organization_id, project_id, r2_key, filename, content_type, size, etag, created_by_sub)
     VALUES ('asset-b', 'org-b', 'p-b', 'org/org-b/proj/p-b/asset/asset-b/asset-b.png', 'b.png', 'image/png', 10, 'e-b', 'sub-b')`
  );
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const sql of loadMigrations()) db.exec(sql);
  seed();
});

function makeEnv(): Env {
  return {
    DB: createSqliteD1(db),
    FILES: new MemoryR2Bucket() as unknown as Env['FILES'],
    FREEBUFF_CLIENT_ID: 'client-test',
    FREEBUFF_ISSUER: 'https://issuer.test',
    APP_ORIGIN,
    ALLOWED_ORIGINS: SECOND_HOST
  };
}

function user(sub: string): AuthenticatedUser {
  return { sub, name: sub };
}

const projectsAs = (identity: AuthenticatedUser | null) =>
  createProjectsApp({ resolveUser: async () => identity });

async function call(
  app: ReturnType<typeof createProjectsApp>,
  path: string,
  init: RequestInit = {},
  env: Env = makeEnv()
): Promise<Response> {
  return app.request(`https://api.example${path}`, init, env);
}

const mutation = (body: unknown, origin: string | null = APP_ORIGIN): RequestInit => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(origin ? { Origin: origin } : {})
  },
  body: JSON.stringify(body)
});

function projectTitles(): Array<{ id: string; title: string; status: string }> {
  return db.query('SELECT id, title, status FROM projects ORDER BY id').all() as Array<{
    id: string;
    title: string;
    status: string;
  }>;
}

describe('projects API — authentication gate', () => {
  it('returns 401 for a missing or invalid session', async () => {
    const res = await call(projectsAs(null), '/api/v1/projects', {}, makeEnv());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('returns 503 auth_not_configured (never an anonymous allowance)', async () => {
    const env = makeEnv();
    Reflect.deleteProperty(env, 'FREEBUFF_CLIENT_ID');
    const res = await call(projectsAs(user('sub-a')), '/api/v1/projects', {}, env);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('auth_not_configured');
  });

  it('returns 503 when the D1 binding is absent', async () => {
    const env = makeEnv();
    Reflect.deleteProperty(env, 'DB');
    const res = await call(projectsAs(user('sub-a')), '/api/v1/projects', {}, env);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('not_configured');
  });

  // TASK 09 changed this contract deliberately: a verified user with no
  // membership is now provisioned into exactly one workspace instead of being
  // refused forever (see tests/provisioning.test.ts). The 403 branch therefore
  // now covers only a subject the provisioning policy rejects — a
  // non-canonical one, which the identity layer should never produce but the
  // route wiring must still refuse rather than invent a tenant for.
  it('returns 403 for an ineligible subject and creates no organization', async () => {
    const env = makeEnv();
    const res = await call(projectsAs({ sub: ' sub-orphan ' }), '/api/v1/projects', {}, env);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
    // The per-test seed creates exactly two organizations; refused requests
    // must not add a third.
    expect(db.query('SELECT COUNT(*) AS n FROM organizations').get()).toEqual({ n: 2 });
  });

  it('ignores browser-supplied identity headers', async () => {
    const res = await call(
      projectsAs(user('sub-a')),
      '/api/v1/projects',
      { headers: { 'X-User-Id': 'sub-b', 'X-Organization-Id': 'org-b' } },
      makeEnv()
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.projects.map((p: { id: string }) => p.id)).toEqual(['p-a']);
  });

  it('marks personalized responses private and uncacheable', async () => {
    const res = await call(projectsAs(user('sub-a')), '/api/v1/projects', {}, makeEnv());
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('projects API — tenant isolation', () => {
  it('lists only the caller organization’s projects', async () => {
    const a = await (await call(projectsAs(user('sub-a')), '/api/v1/projects')).json();
    const b = await (await call(projectsAs(user('sub-b')), '/api/v1/projects')).json();
    expect(a.projects.map((p: { id: string }) => p.id)).toEqual(['p-a']);
    expect(b.projects.map((p: { id: string }) => p.id)).toEqual(['p-b']);
  });

  it('cannot read another tenant’s project (404, no existence leak)', async () => {
    const res = await call(projectsAs(user('sub-a')), '/api/v1/projects/p-b');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('cannot modify another tenant’s project', async () => {
    const res = await call(projectsAs(user('sub-a')), '/api/v1/projects/p-b', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
      body: JSON.stringify({ title: 'Hijacked', status: 'published' })
    });
    expect(res.status).toBe(404);
    expect(projectTitles().find((p) => p.id === 'p-b')).toEqual({
      id: 'p-b',
      title: 'B series',
      status: 'draft'
    });
  });

  it('cannot delete another tenant’s project', async () => {
    const res = await call(projectsAs(user('sub-a')), '/api/v1/projects/p-b', {
      method: 'DELETE',
      headers: { Origin: APP_ORIGIN }
    });
    expect(res.status).toBe(404);
    expect(projectTitles().some((p) => p.id === 'p-b')).toBe(true);
  });

  it('scopes creation to the session tenant even when the body asks otherwise', async () => {
    const res = await call(
      projectsAs(user('sub-a')),
      '/api/v1/projects',
      mutation({
        title: 'New A project',
        genre: 'Fantasy',
        organization_id: 'org-b',
        created_by_sub: 'sub-b'
      })
    );
    expect(res.status).toBe(201);
    const created = (await res.json()).project;
    expect(created.title).toBe('New A project');

    const row = db
      .query('SELECT organization_id, created_by_sub, status FROM projects WHERE id = ?')
      .get(created.id) as { organization_id: string; created_by_sub: string; status: string };
    expect(row.organization_id).toBe('org-a');
    expect(row.created_by_sub).toBe('sub-a');
    expect(row.status).toBe('draft');
  });

  it('stores and updates project profile fields without affecting another tenant', async () => {
    const created = await call(
      projectsAs(user('sub-a')),
      '/api/v1/projects',
      mutation({
        title: 'Profiled project',
        genre: 'Noir',
        description: 'A memory broker story.',
        language: 'Korean',
        targetAudience: 'Adults 18-34'
      })
    );
    expect(created.status).toBe(201);
    const project = (await created.json()).project;
    expect(project).toMatchObject({
      description: 'A memory broker story.',
      language: 'Korean',
      target_audience: 'Adults 18-34'
    });

    const patched = await call(projectsAs(user('sub-a')), `/api/v1/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
      body: JSON.stringify({ targetAudience: 'Young adults', language: null })
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).project).toMatchObject({
      description: 'A memory broker story.',
      language: null,
      target_audience: 'Young adults'
    });

    const foreign = await call(projectsAs(user('sub-b')), `/api/v1/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
      body: JSON.stringify({ description: 'Hijacked' })
    });
    expect(foreign.status).toBe(404);
    expect(
      db
        .query("SELECT description FROM project_profiles WHERE project_id = ?")
        .get(project.id) as { description: string }
    ).toEqual({ description: 'A memory broker story.' });
  });

  it('updates and deletes the caller’s own project', async () => {
    const patch = await call(projectsAs(user('sub-a')), '/api/v1/projects/p-a', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
      body: JSON.stringify({ title: 'A series v2', status: 'approved' })
    });
    expect(patch.status).toBe(200);
    const updated = (await patch.json()).project;
    expect(updated.title).toBe('A series v2');
    expect(updated.status).toBe('approved');

    const del = await call(projectsAs(user('sub-a')), '/api/v1/projects/p-a', {
      method: 'DELETE',
      headers: { Origin: APP_ORIGIN }
    });
    expect(del.status).toBe(200);
    expect((await del.json()).deleted).toBe('p-a');
    expect(projectTitles().some((p) => p.id === 'p-a')).toBe(false);
  });

  it('cannot read or delete another tenant’s asset', async () => {
    const assetsAsA = createAssetApp({ resolveUser: async () => user('sub-a') });
    const assetsAsB = createAssetApp({ resolveUser: async () => user('sub-b') });
    const env = makeEnv();
    (env.FILES as MemoryR2Bucket).objects.set(
      'org/org-b/proj/p-b/asset/asset-b/asset-b.png',
      { body: null, size: 10, etag: 'e-b', contentType: 'image/png' }
    );

    const readA = await assetsAsA.request('https://api.example/api/v1/assets/asset-b', {}, env);
    expect(readA.status).toBe(403);
    expect((await readA.json()).error).toBe('forbidden');

    const deleteA = await assetsAsA.request(
      'https://api.example/api/v1/assets/asset-b',
      { method: 'DELETE', headers: { Origin: APP_ORIGIN } },
      env
    );
    expect(deleteA.status).toBe(403);
    expect(
      db.query("SELECT COUNT(*) AS n FROM assets WHERE id = 'asset-b'").get() as { n: number }
    ).toEqual({ n: 1 });

    // The owning tenant is still authorized.
    const readB = await assetsAsB.request(
      'https://api.example/api/v1/assets/asset-b',
      { headers: { Origin: APP_ORIGIN } },
      env
    );
    expect(readB.status).toBe(200);
  });
});

describe('projects API — request validation and origin guard', () => {
  it('rejects a mutation with no Origin header', async () => {
    const res = await call(
      projectsAs(user('sub-a')),
      '/api/v1/projects',
      mutation({ title: 'No origin' }, null)
    );
    expect(res.status).toBe(403);
    expect((await res.json()).detail).toContain('app origin');
  });

  it('rejects a mutation from a foreign origin', async () => {
    const res = await call(
      projectsAs(user('sub-a')),
      '/api/v1/projects',
      mutation({ title: 'Evil' }, 'https://evil.example')
    );
    expect(res.status).toBe(403);
    expect(projectTitles().some((p) => p.title === 'Evil')).toBe(false);
  });

  it('accepts a mutation from the configured second host', async () => {
    const res = await call(
      projectsAs(user('sub-a')),
      '/api/v1/projects',
      mutation({ title: 'From Vercel' }, SECOND_HOST)
    );
    expect(res.status).toBe(201);
  });

  it('rejects empty or over-long titles', async () => {
    for (const title of ['', '   ', 'x'.repeat(201), 42]) {
      const res = await call(projectsAs(user('sub-a')), '/api/v1/projects', mutation({ title }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('bad_request');
    }
  });

  it('rejects an unknown status value', async () => {
    const res = await call(projectsAs(user('sub-a')), '/api/v1/projects/p-a', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
      body: JSON.stringify({ status: 'cancelled' })
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-object JSON body', async () => {
    const res = await call(projectsAs(user('sub-a')), '/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
      body: '[]'
    });
    expect(res.status).toBe(400);
  });
});

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
import {
  ensureOrganizationForUser,
  isEligibleForProvisioning,
  membershipIdForSubject,
  organizationIdForSubject,
  organizationSlugForSubject,
  resolveOrganizationForUser
} from '../worker/src/provisioning';

/**
 * First-use organization provisioning (TASK 09, Priority 1).
 *
 * The real migration files run in real SQLite and the real Hono route code is
 * exercised; only the identity provider is injected, because token
 * verification is the provider's job, not this code's.
 *
 * Asserted here: exactly one organization per subject, one `owner` membership,
 * no duplicate under concurrency, an existing membership always wins, no
 * client-supplied value can choose a tenant, and isolation is preserved.
 */

const MIGRATION_FILES = [
  '0001_init_tenancy.sql',
  '0002_assets_and_replication.sql',
  '0003_story_generation.sql'
];

const APP_ORIGIN = 'https://app.example';
const SECOND_HOST = 'https://vercel.example';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of MIGRATION_FILES) {
    db.exec(readFileSync(join(import.meta.dir, '..', 'db', 'migrations', file), 'utf8'));
  }
});

function makeEnv(): Env {
  return {
    DB: createSqliteD1(db),
    FILES: new MemoryR2Bucket() as unknown as Env['FILES'],
    SUPABASE_URL: 'https://project.supabase.co',
    APP_ORIGIN,
    ALLOWED_ORIGINS: SECOND_HOST
  };
}

const user = (sub: string, name: string | null = sub): AuthenticatedUser => ({ sub, name });

function count(table: string): number {
  return (db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function membershipFor(sub: string): { organization_id: string; role: string } | null {
  return (db
    .query('SELECT organization_id, role FROM organization_memberships WHERE user_sub = ?')
    .get(sub) ?? null) as { organization_id: string; role: string } | null;
}

const projectsAs = (identity: AuthenticatedUser | null) =>
  createProjectsApp({ resolveUser: async () => identity });

const assetsAs = (identity: AuthenticatedUser | null) =>
  createAssetApp({ resolveUser: async () => identity });

async function call(
  app: ReturnType<typeof createProjectsApp> | ReturnType<typeof createAssetApp>,
  path: string,
  init: RequestInit = {},
  env: Env = makeEnv()
): Promise<Response> {
  // Hono may return a Response synchronously; normalize to a promise.
  return await app.request(`https://api.example${path}`, init, env);
}

const mutation = (body: unknown, origin: string | null = APP_ORIGIN): RequestInit => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(origin ? { Origin: origin } : {})
  },
  body: JSON.stringify(body)
});

describe('eligibility policy', () => {
  it('accepts a normalized verified subject', () => {
    expect(isEligibleForProvisioning(user('sub-a'))).toBe(true);
    expect(isEligibleForProvisioning({ sub: 'x'.repeat(255) })).toBe(true);
  });

  it('rejects missing, empty, oversized or non-canonical subjects', () => {
    expect(isEligibleForProvisioning(null)).toBe(false);
    expect(isEligibleForProvisioning(undefined)).toBe(false);
    expect(isEligibleForProvisioning({ sub: '' })).toBe(false);
    expect(isEligibleForProvisioning({ sub: '   ' })).toBe(false);
    // Surrounding whitespace would derive a second organization for one person.
    expect(isEligibleForProvisioning({ sub: ' sub-a ' })).toBe(false);
    expect(isEligibleForProvisioning({ sub: 'x'.repeat(256) })).toBe(false);
    expect(isEligibleForProvisioning({ sub: 42 as unknown as string })).toBe(false);
  });

  it('is not affected by a display name', () => {
    expect(isEligibleForProvisioning({ sub: 'sub-a', name: null })).toBe(true);
    expect(isEligibleForProvisioning({ sub: 'sub-a', name: 'x'.repeat(500) })).toBe(true);
  });
});

describe('first-use provisioning', () => {
  it('creates exactly one organization with an owner membership', async () => {
    const outcome = await ensureOrganizationForUser(makeEnv(), user('sub-new'));

    expect(outcome).not.toBeNull();
    expect(outcome!.created).toBe(true);
    expect(count('organizations')).toBe(1);
    expect(count('organization_memberships')).toBe(1);
    expect(count('users')).toBe(1);
    expect(membershipFor('sub-new')).toEqual({ organization_id: outcome!.organizationId, role: 'owner' });
  });

  it('records exactly one audit event, attributed to the subject', async () => {
    await ensureOrganizationForUser(makeEnv(), user('sub-new'));

    const events = db
      .query('SELECT organization_id, actor_sub, action, target_type FROM audit_events')
      .all() as Array<{ organization_id: string; actor_sub: string; action: string; target_type: string }>;
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('organization.provisioned');
    expect(events[0].actor_sub).toBe('sub-new');
    expect(events[0].target_type).toBe('organization');
  });

  it('is idempotent: repeated sign-ins create nothing new', async () => {
    const env = makeEnv();
    const first = await ensureOrganizationForUser(env, user('sub-new'));
    const second = await ensureOrganizationForUser(env, user('sub-new'));
    const third = await resolveOrganizationForUser(env, user('sub-new'));

    expect(second!.organizationId).toBe(first!.organizationId);
    expect(second!.created).toBe(false);
    expect(third).toBe(first!.organizationId);
    expect(count('organizations')).toBe(1);
    expect(count('organization_memberships')).toBe(1);
    expect(count('audit_events')).toBe(1);
  });

  it('stores the display name but derives identity from the subject alone', async () => {
    const outcome = await ensureOrganizationForUser(makeEnv(), user('sub-new', 'Aiko'));
    expect(db.query('SELECT name FROM organizations WHERE id = ?').get(outcome!.organizationId)).toEqual({
      name: 'Aiko'
    });
    // The same subject with a different display name maps to the same tenant.
    const again = await ensureOrganizationForUser(makeEnv(), user('sub-new', 'Renamed'));
    expect(again!.organizationId).toBe(outcome!.organizationId);
    expect(count('organizations')).toBe(1);
  });

  it('falls back to a non-empty name when the provider supplies none', async () => {
    const outcome = await ensureOrganizationForUser(makeEnv(), user('sub-new', '   '));
    const row = db.query('SELECT name FROM organizations WHERE id = ?').get(outcome!.organizationId) as {
      name: string;
    };
    expect(row.name.trim().length).toBeGreaterThan(0);
  });

  it('lets an existing membership win — never a second organization', async () => {
    db.run("INSERT INTO organizations (id, name, slug) VALUES ('org-team', 'Team', 'team')");
    db.run("INSERT INTO users (id) VALUES ('sub-invited')");
    db.run(
      "INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m-inv', 'org-team', 'sub-invited', 'member')"
    );

    const outcome = await ensureOrganizationForUser(makeEnv(), user('sub-invited'));

    expect(outcome).toEqual({ organizationId: 'org-team', created: false });
    expect(count('organizations')).toBe(1);
    expect(membershipFor('sub-invited')).toEqual({ organization_id: 'org-team', role: 'member' });
  });

  it('does nothing without a D1 binding, and never invents a tenant', async () => {
    const env = makeEnv();
    Reflect.deleteProperty(env, 'DB');
    expect(await ensureOrganizationForUser(env, user('sub-new'))).toBeNull();
    expect(await resolveOrganizationForUser(env, user('sub-new'))).toBeNull();
  });

  it('does nothing for an ineligible subject', async () => {
    const env = makeEnv();
    expect(await ensureOrganizationForUser(env, { sub: ' sub-new ' })).toBeNull();
    expect(count('organizations')).toBe(0);
  });

  it('keeps tenants separate: two subjects get two organizations', async () => {
    const env = makeEnv();
    const a = await ensureOrganizationForUser(env, user('sub-a'));
    const b = await ensureOrganizationForUser(env, user('sub-b'));

    expect(a!.organizationId).not.toBe(b!.organizationId);
    expect(count('organizations')).toBe(2);
    expect(count('organization_memberships')).toBe(2);
    expect(count('users')).toBe(2);
  });
});

describe('concurrency safety', () => {
  it('derives stable keys from the subject', async () => {
    expect(await organizationIdForSubject('sub-a')).toBe(await organizationIdForSubject('sub-a'));
    expect(await organizationIdForSubject('sub-a')).not.toBe(await organizationIdForSubject('sub-b'));
    expect(await membershipIdForSubject('sub-a')).not.toBe(await organizationIdForSubject('sub-a'));
    expect(await organizationSlugForSubject('sub-a')).toBe(await organizationSlugForSubject('sub-a'));
    // The derived id is what is actually persisted.
    const outcome = await ensureOrganizationForUser(makeEnv(), user('sub-a'));
    expect(outcome!.organizationId).toBe(await organizationIdForSubject('sub-a'));
  });

  it('leaves no duplicate when eight first sign-ins race', async () => {
    const env = makeEnv();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => ensureOrganizationForUser(env, user('sub-race')))
    );

    const ids = new Set(results.map((result) => result!.organizationId));
    expect(ids.size).toBe(1);
    expect(results.filter((result) => result!.created).length).toBe(1);
    expect(count('organizations')).toBe(1);
    expect(count('organization_memberships')).toBe(1);
    expect(count('users')).toBe(1);
    expect(count('audit_events')).toBe(1);
  });

  it('tolerates losing the race: an organization written by a competitor is reused', async () => {
    const env = makeEnv();
    const orgId = await organizationIdForSubject('sub-a');
    const slug = await organizationSlugForSubject('sub-a');
    // Exactly what a request that won the race would have already written:
    // the user row and the organization row, but not yet the membership.
    db.run("INSERT INTO users (id) VALUES ('sub-a')");
    // Inlined deliberately: both values are derived hashes ([0-9a-f-] only).
    db.run(`INSERT INTO organizations (id, name, slug) VALUES ('${orgId}', 'Personal workspace', '${slug}')`);

    const outcome = await ensureOrganizationForUser(env, user('sub-a'));

    expect(outcome!.organizationId).toBe(orgId);
    expect(outcome!.created).toBe(false);
    expect(count('organizations')).toBe(1);
    expect(count('organization_memberships')).toBe(1);
    expect(membershipFor('sub-a')).toEqual({ organization_id: orgId, role: 'owner' });
  });
});

describe('route integration', () => {
  it('a brand-new signed-in user lands in a workspace instead of a 403', async () => {
    const res = await call(projectsAs(user('sub-new')), '/api/v1/projects');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projects: [] });
    expect(count('organizations')).toBe(1);
  });

  it('provisions for the asset routes too', async () => {
    const res = await call(assetsAs(user('sub-new')), '/api/v1/assets');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ assets: [] });
    expect(count('organizations')).toBe(1);
  });

  it('provisions nothing for a signed-out request', async () => {
    const res = await call(projectsAs(null), '/api/v1/projects');
    expect(res.status).toBe(401);
    expect(count('organizations')).toBe(0);
    expect(count('organization_memberships')).toBe(0);
    expect(count('users')).toBe(0);
  });

  it('ignores a client-supplied organization and writes to the caller’s own tenant', async () => {
    const env = makeEnv();
    const callerOrg = await organizationIdForSubject('sub-a');

    const res = await call(
      projectsAs(user('sub-a')),
      '/api/v1/projects',
      mutation({ title: 'Caller series', organization_id: 'org-someone-else' }),
      env
    );
    expect(res.status).toBe(201);

    const row = db.query('SELECT organization_id, created_by_sub FROM projects').get() as {
      organization_id: string;
      created_by_sub: string;
    };
    expect(row.organization_id).toBe(callerOrg);
    expect(row.created_by_sub).toBe('sub-a');
  });

  it('keeps provisioned tenants isolated across routes', async () => {
    // Two first-time users, each provisioned on their own first request.
    const created = await call(projectsAs(user('sub-a')), '/api/v1/projects', mutation({ title: 'A only' }));
    expect(created.status).toBe(201);
    const projectId = ((await created.json()) as { project: { id: string } }).project.id;

    const otherUser = await call(projectsAs(user('sub-b')), `/api/v1/projects/${projectId}`);
    expect(otherUser.status).toBe(404);
    expect((await otherUser.json()).error).toBe('not_found');

    const owner = await call(projectsAs(user('sub-a')), `/api/v1/projects/${projectId}`);
    expect(owner.status).toBe(200);

    expect(count('organizations')).toBe(2);
  });

  it('does not provision when an allow-listed Origin is missing on a mutation', async () => {
    const res = await call(projectsAs(user('sub-new')), '/api/v1/projects', mutation({ title: 'X' }, null));
    expect(res.status).toBe(403);
    expect(count('organizations')).toBe(0);
  });
});

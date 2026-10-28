import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from '../worker/src/env';
import type { AuthenticatedUser } from '../worker/src/identity';
import { createProjectsApp } from '../worker/src/projects';
import { createSqliteD1 } from './helpers/d1';
import {
  ensureOrganizationForUser,
  isEligibleForProvisioning,
  organizationIdForSubject
} from '../worker/src/provisioning';

/**
 * Supabase subjects in the tenancy layer (TASK 11).
 *
 * Supabase mints UUID `sub` claims, while the schema was first written against
 * opaque OIDC subjects. These tests prove that nothing in provisioning or
 * isolation depended on the old shape: identifiers are still derived from the
 * subject alone, one workspace is created per subject, concurrent first
 * requests converge, and no email/display-name match ever merges two users.
 *
 * No migration is needed or was added: `users.id` is TEXT.
 */

const MIGRATIONS = ['0001_init_tenancy.sql', '0002_assets_and_replication.sql', '0003_story_generation.sql'].map(
  (file) => readFileSync(join(import.meta.dir, '..', 'db', 'migrations', file), 'utf8')
);

const UUID_A = '9c6f4b2e-1d3a-4c58-9e77-0a1b2c3d4e5f';
const UUID_B = '1f0e9d8c-7b6a-4593-8a21-c4d5e6f70819';
const ORIGIN = 'https://app.example';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const sql of MIGRATIONS) db.exec(sql);
});

function makeEnv(): Env {
  return { DB: createSqliteD1(db), SUPABASE_URL: 'https://project.supabase.co', APP_ORIGIN: ORIGIN };
}

function count(sql: string): number {
  return (db.query(sql).get() as { n: number }).n;
}

const user = (sub: string, name: string | null = null): AuthenticatedUser => ({ sub, name });

describe('a Supabase UUID subject is a first-class tenant key', () => {
  it('is eligible and gets deterministic identifiers', async () => {
    expect(isEligibleForProvisioning(user(UUID_A))).toBe(true);

    const first = await organizationIdForSubject(UUID_A);
    const second = await organizationIdForSubject(UUID_A);
    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(first).not.toContain(UUID_A); // derived, never the raw subject
    expect(await organizationIdForSubject(UUID_B)).not.toBe(first);
  });

  it('creates exactly one workspace with an owner membership on first use', async () => {
    const created = await ensureOrganizationForUser(makeEnv(), user(UUID_A, 'Ada Lovelace'));
    if (!created) throw new Error('expected provisioning to succeed');

    expect(created.created).toBe(true);
    expect(count('SELECT COUNT(*) AS n FROM organizations')).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(1);
    expect(
      db.query("SELECT role, user_sub FROM organization_memberships WHERE organization_id = ?").get(
        created.organizationId
      )
    ).toEqual({ role: 'owner', user_sub: UUID_A });
    expect(db.query('SELECT id FROM users WHERE id = ?').get(UUID_A)).toEqual({ id: UUID_A });
    expect(
      db.query('SELECT name FROM organizations WHERE id = ?').get(created.organizationId)
    ).toEqual({ name: 'Ada Lovelace' });
  });

  it('is idempotent on repeated sign-ins and never adds a second workspace', async () => {
    const env = makeEnv();
    const first = await ensureOrganizationForUser(env, user(UUID_A));
    const second = await ensureOrganizationForUser(env, user(UUID_A));

    expect(second?.organizationId).toBe(first?.organizationId as string);
    expect(second?.created).toBe(false);
    expect(count('SELECT COUNT(*) AS n FROM organizations')).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'organization.provisioned'")).toBe(1);
  });

  it('converges under concurrent first requests', async () => {
    const env = makeEnv();
    const outcomes = await Promise.all([
      ensureOrganizationForUser(env, user(UUID_A)),
      ensureOrganizationForUser(env, user(UUID_A)),
      ensureOrganizationForUser(env, user(UUID_A)),
      ensureOrganizationForUser(env, user(UUID_A))
    ]);

    const ids = new Set(outcomes.map((outcome) => outcome?.organizationId));
    expect(ids.size).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM organizations')).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(1);
  });

  it('never links accounts by email or display name', async () => {
    const env = makeEnv();
    // Same human-looking display name, two different Supabase identities.
    const a = await ensureOrganizationForUser(env, user(UUID_A, 'ada@example.com'));
    const b = await ensureOrganizationForUser(env, user(UUID_B, 'ada@example.com'));

    expect(a?.organizationId).not.toBe(b?.organizationId as string);
    expect(count('SELECT COUNT(*) AS n FROM organizations')).toBe(2);
    expect(count('SELECT COUNT(*) AS n FROM organization_memberships')).toBe(2);

    // The schema stores no email at all, so no lookup by email can exist.
    const userColumns = (db.query('PRAGMA table_info(users)').all() as Array<{ name: string }>).map(
      (column) => column.name
    );
    expect(userColumns).not.toContain('email');
  });
});

describe('tenant isolation holds for UUID identities', () => {
  const appAs = (sub: string) => createProjectsApp({ resolveUser: async () => user(sub) });

  const create = (title: string) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ title })
  });

  it('scopes projects to the caller and answers 404 for another tenant id', async () => {
    const env = makeEnv();
    const created = await appAs(UUID_A).request('https://api.example/api/v1/projects', create('A series'), env);
    expect(created.status).toBe(201);
    const projectId = (await created.json()).project.id as string;

    const listA = await appAs(UUID_A).request('https://api.example/api/v1/projects', {}, env);
    expect((await listA.json()).projects).toHaveLength(1);

    const listB = await appAs(UUID_B).request('https://api.example/api/v1/projects', {}, env);
    expect((await listB.json()).projects).toEqual([]);

    for (const [method, init] of [
      ['GET', {}],
      ['PATCH', { ...create('Hijacked'), method: 'PATCH' }],
      ['DELETE', { method: 'DELETE', headers: { Origin: ORIGIN } }]
    ] as const) {
      const response = await appAs(UUID_B).request(
        `https://api.example/api/v1/projects/${projectId}`,
        { ...init, method },
        env
      );
      expect(response.status).toBe(404);
    }

    expect(db.query('SELECT title FROM projects WHERE id = ?').get(projectId)).toEqual({
      title: 'A series'
    });
  });
});

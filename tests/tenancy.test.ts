import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tenant-isolation and migration tests (blueprint TASK 07).
 *
 * D1 is SQLite-compatible, so the REAL migration file is executed against an
 * in-memory database and the isolation primitives the API must use are
 * asserted here: sub-keyed membership checks, organization-scoped queries,
 * foreign keys, CHECK constraints, and cascade behavior.
 */

const MIGRATIONS = ['0001_init_tenancy.sql', '0002_assets_and_replication.sql'].map((file) =>
  readFileSync(join(import.meta.dir, '..', 'migrations', file), 'utf8')
);

let db: Database;

/** bun:sqlite returns untyped rows; a single documented assertion point. */
function rows<T>(sql: string): T[] {
  return db.query(sql).all() as T[];
}

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const sql of MIGRATIONS) db.exec(sql);

  db.run("INSERT INTO organizations (id, name, slug) VALUES ('org-a', 'Org A', 'org-a')");
  db.run("INSERT INTO organizations (id, name, slug) VALUES ('org-b', 'Org B', 'org-b')");
  db.run("INSERT INTO users (id, display_name) VALUES ('sub-a', 'User A')");
  db.run("INSERT INTO users (id) VALUES ('sub-b')");
  db.run("INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m-a', 'org-a', 'sub-a', 'owner')");
  db.run("INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m-b', 'org-b', 'sub-b', 'member')");
  db.run("INSERT INTO projects (id, organization_id, title, created_by_sub) VALUES ('p-a', 'org-a', 'Project A', 'sub-a')");
  db.run("INSERT INTO projects (id, organization_id, title) VALUES ('p-b', 'org-b', 'Project B')");
});

afterAll(() => db.close());

describe('migration creates the expected schema', () => {
  test('all tenant tables exist', () => {
    // Note: real D1 also contains internal tables (d1_migrations, _cf_KV);
    // plain SQLite executing the raw migration contains exactly these.
    const tables = rows<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
    )
      .map((r) => r.name)
      .sort();
    expect(tables).toEqual([
      'assets',
      'audit_events',
      'organization_memberships',
      'organizations',
      'projects',
      'replication_outbox',
      'replication_state',
      'users',
    ]);
  });

  test('expected indexes exist', () => {
    const indexes = rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .map((r) => r.name)
      .sort();
    expect(indexes).toEqual([
      'idx_assets_org',
      'idx_assets_project',
      'idx_audit_org_created',
      'idx_memberships_org',
      'idx_memberships_user',
      'idx_outbox_pending',
      'idx_projects_org',
    ]);
  });
});

describe('tenant isolation primitives', () => {
  test('organization-scoped queries never cross tenants', () => {
    const a = db.query('SELECT id FROM projects WHERE organization_id = ?').all('org-a');
    const b = db.query('SELECT id FROM projects WHERE organization_id = ?').all('org-b');
    expect(a).toEqual([{ id: 'p-a' }]);
    expect(b).toEqual([{ id: 'p-b' }]);
  });

  test('sub-keyed membership joins return only the caller’s tenant data', () => {
    const accessibleToA = db
      .query(
        `SELECT p.id FROM projects p
         JOIN organization_memberships m ON m.organization_id = p.organization_id
         WHERE m.user_sub = ? ORDER BY p.id`
      )
      .all('sub-a');
    const accessibleToB = db
      .query(
        `SELECT p.id FROM projects p
         JOIN organization_memberships m ON m.organization_id = p.organization_id
         WHERE m.user_sub = ? ORDER BY p.id`
      )
      .all('sub-b');
    expect(accessibleToA).toEqual([{ id: 'p-a' }]);
    expect(accessibleToB).toEqual([{ id: 'p-b' }]);
  });

  test('a non-member has no role in another tenant (authorization primitive)', () => {
    const role = db
      .query('SELECT role FROM organization_memberships WHERE organization_id = ? AND user_sub = ?')
      .get('org-b', 'sub-a');
    expect(role).toBeNull();
  });

  test('emails are never stored; identity is keyed by OIDC sub only', () => {
    const userColumns = rows<{ name: string }>('PRAGMA table_info(users)').map((c) => c.name);
    expect(userColumns).not.toContain('email');
    expect(userColumns).toContain('id');
  });
});

describe('constraints are enforced', () => {
  test('invalid membership role rejected', () => {
    expect(() =>
      db.run("INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m-x', 'org-a', 'sub-b', 'wizard')")
    ).toThrow();
  });

  test('invalid project status rejected', () => {
    expect(() =>
      db.run("INSERT INTO projects (id, organization_id, title, status) VALUES ('p-x', 'org-a', 'X', 'cancelled')")
    ).toThrow();
  });

  test('empty project title rejected', () => {
    expect(() => db.run("INSERT INTO projects (id, organization_id, title) VALUES ('p-x2', 'org-a', '')")).toThrow();
  });

  test('foreign keys are enforced (unknown organization rejected)', () => {
    expect(() => db.run("INSERT INTO projects (id, organization_id, title) VALUES ('p-x3', 'org-missing', 'X')")).toThrow();
  });

  test('duplicate membership for the same (org, user) rejected', () => {
    expect(() =>
      db.run("INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m-dup', 'org-a', 'sub-a', 'member')")
    ).toThrow();
  });
});

describe('assets and replication schema (migration 0002)', () => {
  test('an asset is cascade-deleted with its project', () => {
    db.run("INSERT INTO projects (id, organization_id, title) VALUES ('p-temp', 'org-a', 'Temp')");
    db.run(
      `INSERT INTO assets (id, organization_id, project_id, r2_key, filename, content_type, size)
       VALUES ('asset-temp', 'org-a', 'p-temp', 'org/org-a/proj/p-temp/asset/asset-temp/a.png', 'a.png', 'image/png', 1)`
    );
    db.run("DELETE FROM projects WHERE id = 'p-temp'");
    expect(db.query('SELECT COUNT(*) AS n FROM assets WHERE id = ?').get('asset-temp')).toEqual({ n: 0 });
  });

  test('the outbox idempotency key is unique per target', () => {
    const insert = db.prepare(
      `INSERT INTO replication_outbox
         (id, target, entity_table, entity_id, organization_id, operation, payload, idempotency_key)
       VALUES (?, 'supabase', 'projects', 'p-a', 'org-a', 'upsert', '{}', 'key-1')`
    );
    insert.run('outbox-1');
    expect(() => insert.run('outbox-2')).toThrow();
    expect(() =>
      db.run(
        `INSERT INTO replication_outbox
           (id, target, entity_table, entity_id, organization_id, operation, payload, idempotency_key)
         VALUES ('outbox-3', 'other', 'projects', 'p-a', 'org-a', 'upsert', '{}', 'key-1')`
      )
    ).not.toThrow();
  });

  test('the outbox rejects unknown entity tables and negative attempts', () => {
    expect(() =>
      db.run(
        `INSERT INTO replication_outbox
           (id, target, entity_table, entity_id, organization_id, operation, payload, idempotency_key)
         VALUES ('o-bad', 'supabase', 'users', 'u-1', 'org-a', 'upsert', '{}', 'key-bad')`
      )
    ).toThrow();
    expect(() =>
      db.run(
        `INSERT INTO replication_outbox
           (id, target, entity_table, entity_id, organization_id, operation, payload, idempotency_key, attempts)
         VALUES ('o-neg', 'supabase', 'projects', 'p-a', 'org-a', 'upsert', '{}', 'key-neg', -1)`
      )
    ).toThrow();
  });

  test('replication state starts empty and only records real markers', () => {
    db.run("INSERT INTO replication_state (target) VALUES ('supabase')");
    expect(
      db.query("SELECT last_success_at, pending_count FROM replication_state WHERE target = 'supabase'").get()
    ).toEqual({ last_success_at: null, pending_count: 0 });
  });
});

describe('deleting a tenant cascades', () => {
  test('org deletion removes its memberships, projects, and audit rows', () => {
    db.run("INSERT INTO organizations (id, name, slug) VALUES ('org-x', 'Org X', 'org-x')");
    db.run("INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m-x', 'org-x', 'sub-a', 'member')");
    db.run("INSERT INTO projects (id, organization_id, title) VALUES ('p-x', 'org-x', 'Doomed')");
    db.run("INSERT INTO audit_events (organization_id, actor_sub, action) VALUES ('org-x', 'sub-a', 'test.event')");

    db.run("DELETE FROM organizations WHERE id = 'org-x'");

    expect(db.query('SELECT COUNT(*) AS n FROM organization_memberships WHERE organization_id = ?').get('org-x')).toEqual({ n: 0 });
    expect(db.query('SELECT COUNT(*) AS n FROM projects WHERE organization_id = ?').get('org-x')).toEqual({ n: 0 });
    expect(db.query('SELECT COUNT(*) AS n FROM audit_events WHERE organization_id = ?').get('org-x')).toEqual({ n: 0 });
  });
});

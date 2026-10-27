import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeMigrationChain, stripSqlComments } from '../scripts/check-migrations.mjs';

/**
 * Migration safety (TASK 09, Priority 2).
 *
 * The remote D1 already has `0001` applied AND an `assets` table that was
 * created outside the migration chain (TASK 12). These tests reproduce that
 * exact shape against a disposable local database and prove that the TRACKED
 * chain is non-destructive and re-runnable there — and that the checker which
 * guards the apply actually catches the untracked duplicate that made the
 * chain unappliable.
 */

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'db', 'migrations');
const TRACKED_CHAIN = [
  '0001_init_tenancy.sql',
  '0002_assets_and_replication.sql',
  '0003_story_generation.sql'
];

const read = (file: string): string => readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

/**
 * The `assets` table exactly as the live D1 has it: created outside the
 * migration chain, carrying the stray file's index names. Reproduced here as a
 * literal because the stray file itself is untracked — a test must never
 * depend on an untracked file's presence.
 */
const LEGACY_ASSETS_SQL = `
CREATE TABLE assets (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  r2_key          TEXT NOT NULL CHECK (length(r2_key) > 0),
  filename        TEXT NOT NULL CHECK (length(filename) > 0),
  content_type    TEXT NOT NULL CHECK (length(content_type) > 0),
  size            INTEGER NOT NULL CHECK (size >= 0),
  etag            TEXT,
  created_by_sub  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX idx_assets_r2_key ON assets (r2_key);
CREATE INDEX idx_assets_org_proj ON assets (organization_id, project_id);
`;

/** The untracked duplicate, as a synthetic input to the checker. */
const STRAY_DUPLICATE_SQL = `
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL CHECK (length(r2_key) > 0)
);
CREATE UNIQUE INDEX idx_assets_r2_key ON assets (r2_key);
CREATE INDEX idx_assets_org_proj ON assets (organization_id, project_id);
`;

function trackedChainFiles(): Array<{ name: string; sql: string }> {
  return TRACKED_CHAIN.map((name) => ({ name, sql: read(name) }));
}

function tableNames(db: Database): string[] {
  return (
    db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as Array<{ name: string }>
  )
    .map((row) => row.name)
    .sort();
}

function indexNames(db: Database): string[] {
  return (
    db.query("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>
  )
    .map((row) => row.name)
    .sort();
}

describe('the tracked chain applies cleanly to an empty database', () => {
  it('creates every table, in filename order, with no error', () => {
    const db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const file of trackedChainFiles()) db.exec(file.sql);

    expect(tableNames(db)).toEqual([
      'assets',
      'audit_events',
      'credit_accounts',
      'credit_holds',
      'credit_ledger',
      'episodes',
      'generation_jobs',
      'organization_memberships',
      'organizations',
      'project_profiles',
      'projects',
      'replication_outbox',
      'replication_state',
      'story_bibles',
      'users'
    ]);
    db.close();
  });

  it('is self-sufficient: `assets` comes from the chain, not from the stray file', () => {
    const db = new Database(':memory:');
    for (const file of trackedChainFiles()) db.exec(file.sql);
    expect(tableNames(db)).toContain('assets');
    // The chain's own index names, distinct from the legacy ones.
    expect(indexNames(db)).toContain('idx_assets_org');
    expect(indexNames(db)).toContain('idx_assets_project');
    db.close();
  });

  it('contains no destructive statement (comments excluded)', () => {
    for (const name of TRACKED_CHAIN) {
      const sql = stripSqlComments(read(name));
      expect(sql).not.toMatch(/\bDROP\s+(TABLE|INDEX|VIEW|TRIGGER)\b/i);
      expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(sql).not.toMatch(/\bUPDATE\s+[A-Za-z_]+\s+SET\b/i);
    }
  });

  it('makes every CREATE after 0001 idempotent, so a re-run cannot fail', () => {
    for (const name of TRACKED_CHAIN.slice(1)) {
      const statements = stripSqlComments(read(name)).matchAll(
        /\bCREATE\s+(TABLE|UNIQUE\s+INDEX|INDEX)\s+(?!IF\s+NOT\s+EXISTS\b)\S/gi
      );
      expect([...statements]).toEqual([]);
    }
  });
});

describe('production drift: the database already has `assets`', () => {
  /** Mirrors the live remote D1: 0001 applied, `assets` created outside the chain. */
  function driftedDatabase(): Database {
    const db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(read('0001_init_tenancy.sql'));
    db.exec(LEGACY_ASSETS_SQL);
    return db;
  }

  it('applies the remaining tracked migrations without an "already exists" error', () => {
    const db = driftedDatabase();
    expect(() => {
      db.exec(read('0002_assets_and_replication.sql'));
      db.exec(read('0003_story_generation.sql'));
    }).not.toThrow();

    expect(tableNames(db)).toEqual([
      'assets',
      'audit_events',
      'credit_accounts',
      'credit_holds',
      'credit_ledger',
      'episodes',
      'generation_jobs',
      'organization_memberships',
      'organizations',
      'project_profiles',
      'projects',
      'replication_outbox',
      'replication_state',
      'story_bibles',
      'users'
    ]);
    db.close();
  });

  it('is non-destructive: pre-existing rows and the legacy table survive', () => {
    const db = driftedDatabase();
    db.run("INSERT INTO organizations (id, name, slug) VALUES ('org-live', 'Live', 'live')");
    db.run("INSERT INTO users (id) VALUES ('sub-live')");
    db.run(
      "INSERT INTO projects (id, organization_id, title) VALUES ('p-live', 'org-live', 'Existing series')"
    );
    db.run(
      `INSERT INTO assets (id, organization_id, project_id, r2_key, filename, content_type, size)
       VALUES ('asset-live', 'org-live', 'p-live', 'org/org-live/proj/p-live/a/a.png', 'a.png', 'image/png', 12)`
    );

    db.exec(read('0002_assets_and_replication.sql'));
    db.exec(read('0003_story_generation.sql'));

    expect(db.query('SELECT title FROM projects WHERE id = ?').get('p-live')).toEqual({
      title: 'Existing series'
    });
    expect(db.query('SELECT r2_key FROM assets WHERE id = ?').get('asset-live')).toEqual({
      r2_key: 'org/org-live/proj/p-live/a/a.png'
    });
    expect(db.query('SELECT COUNT(*) AS n FROM organizations').get()).toEqual({ n: 1 });
    // The legacy unique index is untouched and the chain's own indexes now exist.
    expect(indexNames(db)).toContain('idx_assets_r2_key');
    expect(indexNames(db)).toContain('idx_assets_org');
    db.close();
  });

  it('can be re-applied (retry-safe): a second run changes nothing', () => {
    const db = driftedDatabase();
    for (const file of TRACKED_CHAIN.slice(1)) db.exec(read(file));
    const before = tableNames(db);
    expect(() => {
      for (const file of TRACKED_CHAIN.slice(1)) db.exec(read(file));
    }).not.toThrow();
    expect(tableNames(db)).toEqual(before);
    db.close();
  });
});

describe('the preflight checker catches the untracked duplicate', () => {
  it('accepts the real tracked chain with zero blockers', () => {
    const result = analyzeMigrationChain(trackedChainFiles());
    expect(result.blockers).toEqual([]);
    expect(result.ordered.map((file) => file.name)).toEqual([
      '0001_init_tenancy.sql',
      '0002_assets_and_replication.sql',
      '0003_story_generation.sql'
    ]);
  });

  it('blocks the chain when the untracked duplicate is present', () => {
    const result = analyzeMigrationChain([
      ...trackedChainFiles(),
      { name: '0002_assets.sql', sql: STRAY_DUPLICATE_SQL }
    ]);

    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers.join('\n')).toContain('0002_assets.sql');
    expect(result.blockers.join('\n')).toContain('non-idempotent');
    // The stray file sorts first, which is why it aborts the whole apply.
    expect(result.ordered[1].name).toBe('0002_assets.sql');
    // Shared numeric prefix is reported as a warning, not silently ignored.
    expect(result.warnings.join('\n')).toContain('0002');
  });

  it('blocks destructive statements even in an otherwise valid file', () => {
    const result = analyzeMigrationChain([
      { name: '0004_cleanup.sql', sql: 'DROP TABLE projects;\nDELETE FROM users;' }
    ]);
    expect(result.blockers.length).toBe(2);
  });

  it('never scans SQL comments (0003 legitimately mentions ALTER in prose)', () => {
    const sql = read('0003_story_generation.sql');
    expect(sql).toContain('ALTER');
    expect(stripSqlComments(sql)).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(analyzeMigrationChain([{ name: '0003_story_generation.sql', sql }]).blockers).toEqual([]);
  });
});

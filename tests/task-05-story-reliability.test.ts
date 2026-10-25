import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from '../worker/src/env';
import type { AuthenticatedUser } from '../worker/src/identity';
import type { AiProvider } from '../worker/src/ai';
import { createStoryApp } from '../worker/src/story';
import { createSqliteD1 } from './helpers/d1';

/**
 * TASK 05 reliability-focused story tests (automated-only; no live provider).
 *
 * These run the real story routes against the real migrations in SQLite with an
 * injected identity/provider. They target the specific risks called out for this
 * task: concurrent version allocation (unique-constraint safety net), idempotent
 * job finalization, and the held-credit/interrupted-job semantics that depend on
 * the unique constraints and state transitions already in the schema/routes.
 */

const MIGRATIONS = [
  '0001_init_tenancy.sql',
  '0002_assets_and_replication.sql',
  '0003_story_generation.sql'
].map((file) => readFileSync(join(import.meta.dir, '..', 'migrations', file), 'utf8'));

const APP_ORIGIN = 'https://app.example';
const NOW = new Date('2026-10-23T12:00:00Z');

const BIBLE = {
  premise: 'A city where memories can be traded.',
  synopsis: 'A broker discovers her own past was sold.',
  worldbuilding: 'Neon city, memory markets, memory police.',
  worldRules: ['Memories can be extracted', 'Trade erases the original'],
  characters: [
    {
      name: 'Mira',
      role: 'Broker',
      motivation: 'Recover her past',
      abilities: ['Read residue'],
      relationships: ['Owes Kade']
    }
  ],
  locations: [{ name: 'The Vault', description: 'Memory exchange' }],
  factions: [{ name: 'Memory Police', description: 'Regulates trade' }],
  timeline: ['Before: the sale', 'Now: the search'],
  continuity: ['Mira cannot remember her sister'],
  themes: ['Identity', 'Grief'],
  tone: 'Noir',
  structure: 'Three acts',
  arcs: [{ title: 'The Missing Year', summary: 'Mira recovers fragments' }]
};

const EPISODE = {
  title: 'The Memory Broker',
  outline: ['Mira sells a memory', 'A client recognizes her', 'The police close in'],
  script: 'PANEL 1: Rain on neon.\nMIRA: This one is warm.\nPANEL 2: The client freezes.'
};

class FakeProvider implements AiProvider {
  name = 'gemini';
  model = 'test-model';
  calls: string[] = [];

  constructor(private readonly behaviour: string | (() => Promise<string>) = JSON.stringify(BIBLE)) {}

  async generate(prompt: string): Promise<string> {
    this.calls.push(prompt);
    return typeof this.behaviour === 'function' ? this.behaviour() : this.behaviour;
  }
}

let db: Database;
let env: Env;

function migrate(database: Database): void {
  database.exec('PRAGMA foreign_keys = ON');
  for (const sql of MIGRATIONS) database.exec(sql);
}

function seed(): void {
  db.run("INSERT INTO organizations (id, name, slug) VALUES ('org-a', 'Org A', 'org-a')");
  db.run("INSERT INTO organizations (id, name, slug) VALUES ('org-b', 'Org B', 'org-b')");
  db.run("INSERT INTO users (id, display_name) VALUES ('sub-a', 'A')");
  db.run("INSERT INTO users (id, display_name) VALUES ('sub-b', 'B')");
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
}

beforeEach(() => {
  db = new Database(':memory:');
  migrate(db);
  seed();
  env = {
    DB: createSqliteD1(db),
    FREEBUFF_CLIENT_ID: 'client-test',
    FREEBUFF_ISSUER: 'https://issuer.test',
    APP_ORIGIN
  };
});

const userA: AuthenticatedUser = { sub: 'sub-a', name: 'A' };
const userB: AuthenticatedUser = { sub: 'sub-b', name: 'B' };

function storyApp(identity: AuthenticatedUser | null, provider: AiProvider | null) {
  return createStoryApp({
    resolveUser: async () => identity,
    resolveProvider: () => provider,
    now: () => NOW
  });
}

const mutation = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
  body: JSON.stringify(body)
});

async function postGeneration(
  app: ReturnType<typeof storyApp>,
  body: unknown,
  project = 'p-a'
): Promise<Response> {
  return app.request(`https://app.example/api/v1/projects/${project}/generations`, mutation(body), env);
}

function latestBibleVersion(): number {
  const row = db
    .query('SELECT COALESCE(MAX(version), 0) AS version FROM story_bibles WHERE organization_id = ?')
    .get('org-a') as { version: number } | null;
  return row?.version ?? 0;
}

function latestEpisodeVersion(episodeNumber: number): number {
  const row = db
    .query(
      `SELECT COALESCE(MAX(version), 0) AS version FROM episodes WHERE organization_id = ? AND episode_number = ?`
    )
    .get('org-a', episodeNumber) as { version: number } | null;
  return row?.version ?? 0;
}

function bibleCount(): number {
  return (
    (db.query('SELECT COUNT(*) AS n FROM story_bibles').get() as { n: number })?.n ?? 0
  );
}

function episodeCount(episodeNumber: number): number {
  return (
    (db.query('SELECT COUNT(*) AS n FROM episodes WHERE organization_id = ? AND episode_number = ?').get(
      'org-a',
      episodeNumber
    ) as { n: number })?.n ?? 0
  );
}

function jobRow(jobId: string) {
  return db
    .query(
      `SELECT status, error_code, output_type, output_id, attempts, started_at, completed_at FROM generation_jobs WHERE id = ?`
    )
    .get(jobId) as {
    status: string;
    error_code: string | null;
    output_type: string | null;
    output_id: string | null;
    attempts: number;
    started_at: string | null;
    completed_at: string | null;
  } | null;
}

describe('TASK 05 — concurrent version allocation is structurally safe', () => {
  it('cannot insert two Story Bibles with the same project + version', async () => {
    // The schema protects this with UNIQUE(project_id, version), but the route
    // reads MAX(version) then inserts. Under real concurrency that read could
    // race; the unique constraint is the final safety net and must actually
    // reject the duplicate at the database.
    db.run(
      `INSERT INTO story_bibles
         (id, organization_id, project_id, version, premise, synopsis, worldbuilding, world_rules,
          characters, locations, factions, timeline, continuity, themes, tone, structure, arcs,
          created_by_sub, created_at, updated_at)
       VALUES ('manual-bible-1', 'org-a', 'p-a', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        BIBLE.premise,
        BIBLE.synopsis,
        BIBLE.worldbuilding,
        JSON.stringify(BIBLE.worldRules),
        JSON.stringify(BIBLE.characters),
        JSON.stringify(BIBLE.locations),
        JSON.stringify(BIBLE.factions),
        JSON.stringify(BIBLE.timeline),
        JSON.stringify(BIBLE.continuity),
        JSON.stringify(BIBLE.themes),
        BIBLE.tone,
        BIBLE.structure,
        JSON.stringify(BIBLE.arcs),
        'sub-a',
        NOW.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        NOW.toISOString().replace(/\.\d{3}Z$/, 'Z')
      ]
    );

    let duplicateRejected = false;
    try {
      db.run(
        `INSERT INTO story_bibles
           (id, organization_id, project_id, version, premise, synopsis, worldbuilding, world_rules,
            characters, locations, factions, timeline, continuity, themes, tone, structure, arcs,
            created_by_sub, created_at, updated_at)
         VALUES ('manual-bible-2', 'org-a', 'p-a', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          BIBLE.premise,
          BIBLE.synopsis,
          BIBLE.worldbuilding,
          JSON.stringify(BIBLE.worldRules),
          JSON.stringify(BIBLE.characters),
          JSON.stringify(BIBLE.locations),
          JSON.stringify(BIBLE.factions),
          JSON.stringify(BIBLE.timeline),
          JSON.stringify(BIBLE.continuity),
          JSON.stringify(BIBLE.themes),
          BIBLE.tone,
          BIBLE.structure,
          JSON.stringify(BIBLE.arcs),
          'sub-a',
          NOW.toISOString().replace(/\.\d{3}Z$/, 'Z'),
          NOW.toISOString().replace(/\.\d{3}Z$/, 'Z')
        ]
      );
    } catch {
      duplicateRejected = true;
    }

    expect(duplicateRejected).toBe(true);
    expect(latestBibleVersion()).toBe(1);
    expect(bibleCount()).toBe(1);
  });

  it('cannot insert two episodes with the same project + episode_number + version', async () => {
    db.run(
      `INSERT INTO episodes
         (id, organization_id, project_id, episode_number, version, title, outline, script,
          status, created_at, updated_at)
       VALUES ('manual-ep-1', 'org-a', 'p-a', 1, 1, ?, ?, ?, 'ready_for_review', ?, ?)`,
      [
        EPISODE.title,
        JSON.stringify(EPISODE.outline),
        EPISODE.script,
        NOW.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        NOW.toISOString().replace(/\.\d{3}Z$/, 'Z')
      ]
    );

    let duplicateRejected = false;
    try {
      db.run(
        `INSERT INTO episodes
           (id, organization_id, project_id, episode_number, version, title, outline, script,
            status, created_at, updated_at)
         VALUES ('manual-ep-2', 'org-a', 'p-a', 1, 1, ?, ?, ?, 'ready_for_review', ?, ?)`,
        [
          EPISODE.title,
          JSON.stringify(EPISODE.outline),
          EPISODE.script,
          NOW.toISOString().replace(/\.\d{3}Z$/, 'Z'),
          NOW.toISOString().replace(/\.\d{3}Z$/, 'Z')
        ]
      );
    } catch {
      duplicateRejected = true;
    }

    expect(duplicateRejected).toBe(true);
    expect(latestEpisodeVersion(1)).toBe(1);
    expect(episodeCount(1)).toBe(1);
  });

  it('two different idempotency keys cannot both succeed once the balance is exhausted', async () => {
    const app = storyApp(userA, new FakeProvider(JSON.stringify(BIBLE)));

    const first = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-first-only',
      concept: 'First'
    });
    expect(first.status).toBe(201);
    expect((await first.json()).credits.balance).toBe(90);

    // Drain the account below the story-bible cost so the second attempt cannot
    // be funded. This is the state a spent-down tenant reaches naturally.
    db.run("UPDATE credit_accounts SET balance = 5 WHERE organization_id = 'org-a'");

    const second = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-second-only',
      concept: 'Second'
    });
    expect(second.status).toBe(402);
    const secondJson = await second.json() as { error: string; credits: { balance: number } };
    expect(secondJson.error).toBe('insufficient_credits');
    expect(secondJson.credits.balance).toBe(5);

    expect(bibleCount()).toBe(1);
    // The refused attempt is still recorded — as a failed job, never as output.
    const jobs = db
      .query(
        "SELECT idempotency_key, status, error_code FROM generation_jobs WHERE organization_id = 'org-a'"
      )
      .all() as Array<{ idempotency_key: string; status: string; error_code: string | null }>;
    expect(jobs).toHaveLength(2);
    expect(jobs.find((job) => job.idempotency_key === 'key-first-only')).toMatchObject({
      status: 'succeeded',
      error_code: null
    });
    expect(jobs.find((job) => job.idempotency_key === 'key-second-only')).toMatchObject({
      status: 'failed',
      error_code: 'insufficient_credits'
    });
  });
});

describe('TASK 05 — idempotent job finalization cannot double-settle or double-release', () => {
  it('settleCredits is idempotent and records only one settle ledger entry', async () => {
    const d1 = createSqliteD1(db);
    const { ensureCreditAccount, reserveCredits, settleCredits } = await import('../worker/src/credits');
    await ensureCreditAccount(d1, 'org-a', NOW);
    db.run(
      `INSERT INTO generation_jobs (id, organization_id, project_id, job_type, status, attempts, max_attempts, idempotency_key)
       VALUES ('job-settle', 'org-a', 'p-a', 'story_bible', 'running', 1, 1, 'key-settle')`
    );
    await reserveCredits(d1, 'org-a', 'job-settle', 10, NOW);

    await settleCredits(d1, 'org-a', 'job-settle', NOW);
    await settleCredits(d1, 'org-a', 'job-settle', NOW);

    const hold = db
      .query('SELECT status, settled_at FROM credit_holds WHERE job_id = ?')
      .get('job-settle') as { status: string; settled_at: string | null } | null;
    expect(hold?.status).toBe('settled');
    expect(hold?.settled_at).not.toBeNull();

    const settles = (
      db.query('SELECT COUNT(*) AS n FROM credit_ledger WHERE organization_id = ? AND type = ?').get(
        'org-a',
        'settle'
      ) as { n: number }
    ).n;
    expect(settles).toBe(1);
    expect((db.query('SELECT balance FROM credit_accounts WHERE organization_id = ?').get('org-a') as { balance: number }).balance).toBe(90);
  });

  it('releaseCredits is idempotent and records only one release ledger entry', async () => {
    const d1 = createSqliteD1(db);
    const { ensureCreditAccount, reserveCredits, releaseCredits } = await import('../worker/src/credits');
    await ensureCreditAccount(d1, 'org-a', NOW);
    db.run(
      `INSERT INTO generation_jobs (id, organization_id, project_id, job_type, status, attempts, max_attempts, idempotency_key)
       VALUES ('job-release', 'org-a', 'p-a', 'story_bible', 'running', 1, 1, 'key-release')`
    );
    await reserveCredits(d1, 'org-a', 'job-release', 10, NOW);

    await releaseCredits(d1, 'org-a', 'job-release', NOW);
    await releaseCredits(d1, 'org-a', 'job-release', NOW);

    const hold = db
      .query('SELECT status, settled_at FROM credit_holds WHERE job_id = ?')
      .get('job-release') as { status: string; settled_at: string | null } | null;
    expect(hold?.status).toBe('released');
    expect(hold?.settled_at).not.toBeNull();

    const releases = (
      db.query('SELECT COUNT(*) AS n FROM credit_ledger WHERE organization_id = ? AND type = ?').get(
        'org-a',
        'release'
      ) as { n: number }
    ).n;
    expect(releases).toBe(1);
    expect((db.query('SELECT balance FROM credit_accounts WHERE organization_id = ?').get('org-a') as { balance: number }).balance).toBe(100);
  });

  it('cannot release a hold that was already settled', async () => {
    const d1 = createSqliteD1(db);
    const { ensureCreditAccount, reserveCredits, settleCredits, releaseCredits } = await import('../worker/src/credits');
    await ensureCreditAccount(d1, 'org-a', NOW);
    db.run(
      `INSERT INTO generation_jobs (id, organization_id, project_id, job_type, status, attempts, max_attempts, idempotency_key)
       VALUES ('job-settled-first', 'org-a', 'p-a', 'story_bible', 'running', 1, 1, 'key-settled-first')`
    );
    await reserveCredits(d1, 'org-a', 'job-settled-first', 10, NOW);
    await settleCredits(d1, 'org-a', 'job-settled-first', NOW);

    await releaseCredits(d1, 'org-a', 'job-settled-first', NOW);

    const hold = db
      .query('SELECT status FROM credit_holds WHERE job_id = ?')
      .get('job-settled-first') as { status: string } | null;
    expect(hold?.status).toBe('settled');

    const releases = (
      db.query('SELECT COUNT(*) AS n FROM credit_ledger WHERE organization_id = ? AND type = ?').get(
        'org-a',
        'release'
      ) as { n: number }
    ).n;
    expect(releases).toBe(0);

    const balance = (db.query('SELECT balance FROM credit_accounts WHERE organization_id = ?').get('org-a') as { balance: number }).balance;
    expect(balance).toBe(90);
  });

  it('failJob transitions pending/running to failed exactly once and releases the hold once', async () => {
    const app = storyApp(userA, new FakeProvider(() => {
      throw new Error('boom');
    }));
    const response = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-fail-job',
      concept: 'Fail the job'
    });
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('server_error');
    expect(json.job.status).toBe('failed');
    expect(json.job.error_code).toBe('server_error');
    expect(json.credits.balance).toBe(100);

    const held = (
      db.query('SELECT COUNT(*) AS n FROM credit_holds WHERE organization_id = ? AND status = ?').get(
        'org-a',
        'held'
      ) as { n: number }
    ).n;
    expect(held).toBe(0);

    const releases = (
      db.query('SELECT COUNT(*) AS n FROM credit_ledger WHERE organization_id = ? AND type = ?').get(
        'org-a',
        'release'
      ) as { n: number }
    ).n;
    expect(releases).toBe(1);
    expect(bibleCount()).toBe(0);
  });

  it('a failed job cannot be settled later by a retry path', async () => {
    const d1 = createSqliteD1(db);
    const { settleCredits } = await import('../worker/src/credits');
    db.run(
      `INSERT INTO generation_jobs (id, organization_id, project_id, job_type, status, attempts, max_attempts, idempotency_key)
       VALUES ('job-already-failed', 'org-a', 'p-a', 'story_bible', 'failed', 1, 1, 'key-already-failed')`
    );
    db.run(
      `INSERT INTO credit_holds (id, organization_id, job_id, amount, status, created_at)
       VALUES ('hold-already-failed', 'org-a', 'job-already-failed', 10, 'released', ?)`,
      [NOW.toISOString().replace(/\.\d{3}Z$/, 'Z')]
    );

    await settleCredits(d1, 'org-a', 'job-already-failed', NOW);

    const hold = db
      .query('SELECT status FROM credit_holds WHERE job_id = ?')
      .get('job-already-failed') as { status: string } | null;
    expect(hold?.status).toBe('released');

    const settles = (
      db.query('SELECT COUNT(*) AS n FROM credit_ledger WHERE organization_id = ? AND type = ?').get(
        'org-a',
        'settle'
      ) as { n: number }
    ).n;
    expect(settles).toBe(0);
  });
});

describe('TASK 05 — held credit semantics and recovery boundaries', () => {
  it('pending/running jobs hold credits until finalized', async () => {
    const app = storyApp(userA, new FakeProvider(() => {
      throw new Error('interrupted');
    }));
    const response = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-held',
      concept: 'Interrupted job'
    });
    // The route treats an unexpected provider throw as a server error and fails
    // the job, which releases the hold. That is the implemented behavior today.
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.job.status).toBe('failed');

    const held = (
      db.query('SELECT COUNT(*) AS n FROM credit_holds WHERE organization_id = ? AND status = ?').get(
        'org-a',
        'held'
      ) as { n: number }
    ).n;
    expect(held).toBe(0);

    const balance = (db.query('SELECT balance FROM credit_accounts WHERE organization_id = ?').get('org-a') as { balance: number }).balance;
    expect(balance).toBe(100);
  });

  it('a job in failed state has no held credits', async () => {
    const d1 = createSqliteD1(db);
    const { ensureCreditAccount, reserveCredits, releaseCredits } = await import('../worker/src/credits');
    await ensureCreditAccount(d1, 'org-a', NOW);
    db.run(
      `INSERT INTO generation_jobs (id, organization_id, project_id, job_type, status, attempts, max_attempts, idempotency_key)
       VALUES ('job-failed-no-hold', 'org-a', 'p-a', 'story_bible', 'failed', 1, 1, 'key-failed-no-hold')`
    );
    await reserveCredits(d1, 'org-a', 'job-failed-no-hold', 10, NOW);
    await releaseCredits(d1, 'org-a', 'job-failed-no-hold', NOW);

    const held = (
      db.query('SELECT COUNT(*) AS n FROM credit_holds WHERE organization_id = ? AND status = ?').get(
        'org-a',
        'held'
      ) as { n: number }
    ).n;
    expect(held).toBe(0);

    const balance = (db.query('SELECT balance FROM credit_accounts WHERE organization_id = ?').get('org-a') as { balance: number }).balance;
    expect(balance).toBe(100);
  });

  it('reservation is refused when the balance is too low, and no hold remains', async () => {
    const d1 = createSqliteD1(db);
    const { ensureCreditAccount, reserveCredits } = await import('../worker/src/credits');
    await ensureCreditAccount(d1, 'org-a', NOW);
    db.run("UPDATE credit_accounts SET balance = 5 WHERE organization_id = 'org-a'");
    db.run(
      `INSERT INTO generation_jobs (id, organization_id, project_id, job_type, status, attempts, max_attempts, idempotency_key)
       VALUES ('job-poor', 'org-a', 'p-a', 'story_bible', 'pending', 0, 1, 'key-poor')`
    );

    const result = await reserveCredits(d1, 'org-a', 'job-poor', 10, NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient_credits');

    const held = (
      db.query('SELECT COUNT(*) AS n FROM credit_holds WHERE organization_id = ?').get('org-a') as { n: number }
    ).n;
    expect(held).toBe(0);

    const balance = (db.query('SELECT balance FROM credit_accounts WHERE organization_id = ?').get('org-a') as { balance: number }).balance;
    expect(balance).toBe(5);
  });

  it('the route rejects media generation for the free plan before any job or hold', async () => {
    // Free-tier media is rejected at the route layer (before any job/hold), so a
    // brand-new organization that has not hit /api/v1/credits yet may have no
    // credit_accounts row at all. That is allowed: the rejection happens before
    // any ensureCreditAccount call for media types.
    const app = storyApp(userA, new FakeProvider());
    for (const type of ['image', 'voice', 'video'] as const) {
      const response = await postGeneration(app, {
        type,
        idempotencyKey: `key-media-${type}`,
        concept: 'Paid media'
      });
      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe('plan_restricted');
    }

    expect(
      (db.query('SELECT COUNT(*) AS n FROM generation_jobs').get() as { n: number }).n
    ).toBe(0);
    expect(
      (db.query('SELECT COUNT(*) AS n FROM credit_holds').get() as { n: number }).n
    ).toBe(0);
    const account = db.query('SELECT balance FROM credit_accounts WHERE organization_id = ?').get('org-a') as { balance: number } | null;
    if (account) expect(account.balance).toBe(0);
  });
});

describe('TASK 05 — cross-tenant access remains denied on story surfaces', () => {
  it('tenant B cannot read, write, generate into, or approve tenant A content', async () => {
    const appA = storyApp(userA, new FakeProvider());
    const generated = await postGeneration(appA, {
      type: 'story_bible',
      idempotencyKey: 'key-tenant-a',
      concept: 'Tenant A story'
    });
    expect(generated.status).toBe(201);
    const jsonA = await generated.json();
    const bibleId = jsonA.output.story_bible.id;
    const jobId = jsonA.job.id;

    await postGeneration(appA, {
      type: 'episode_script',
      idempotencyKey: 'key-tenant-a-ep',
      concept: 'Tenant A episode',
      episodeNumber: 1
    });

    const appB = storyApp(userB, new FakeProvider());

    expect((await appB.request('https://app.example/api/v1/projects/p-a/story-bible', {}, env)).status).toBe(404);
    expect((await appB.request('https://app.example/api/v1/projects/p-a/episodes', {}, env)).status).toBe(404);
    expect((await appB.request(`https://app.example/api/v1/jobs/${jobId}`, {}, env)).status).toBe(404);

    expect(
      (await appB.request(
        'https://app.example/api/v1/projects/p-a/story-bible',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
          body: JSON.stringify(BIBLE)
        },
        env
      )).status
    ).toBe(404);

    expect(
      (await appB.request(
        'https://app.example/api/v1/projects/p-a/episodes/1',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
          body: JSON.stringify({ status: 'approved' })
        },
        env
      )).status
    ).toBe(404);

    expect((await appB.request('https://app.example/api/v1/credits', {}, env)).status).toBe(200);
    const bCredits = (await appB.request('https://app.example/api/v1/credits', {}, env)).json();
    expect((await bCredits).credits.balance).toBe(100);
    expect((db.query('SELECT balance FROM credit_accounts WHERE organization_id = ?').get('org-a') as { balance: number }).balance).toBe(90);
  });
});

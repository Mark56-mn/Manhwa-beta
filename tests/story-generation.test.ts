import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from '../worker/src/env';
import type { AuthenticatedUser } from '../worker/src/identity';
import type { AiProvider } from '../worker/src/ai';
import { AiProviderError } from '../worker/src/ai';
import { createStoryApp } from '../worker/src/story';
import {
  ensureCreditAccount,
  releaseCredits,
  reserveCredits,
  settleCredits
} from '../worker/src/credits';
import { createSqliteD1 } from './helpers/d1';

/**
 * Story generation integration tests (TASK 04).
 *
 * The real Hono routes run against the real migrations in SQLite. Only the AI
 * provider and identity are injected; no network is used.
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

class DeferredProvider implements AiProvider {
  name = 'gemini';
  model = 'test-model';
  calls = 0;
  private resolveGeneration!: (value: string) => void;
  private readonly gate = new Promise<string>((resolve) => {
    this.resolveGeneration = resolve;
  });

  async generate(): Promise<string> {
    this.calls += 1;
    return this.gate;
  }

  release(): void {
    this.resolveGeneration(JSON.stringify(BIBLE));
  }
}

class RoutedProvider extends FakeProvider {
  override async generate(prompt: string): Promise<string> {
    this.calls.push(prompt);
    return prompt.includes('Produce a production-ready Story Bible')
      ? JSON.stringify(BIBLE)
      : JSON.stringify(EPISODE);
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

const generation = (overrides: Record<string, unknown> = {}) =>
  mutation({
    type: 'story_bible',
    idempotencyKey: 'key-story-bible-0001',
    concept: 'A memory broker in a neon city',
    genre: 'Noir',
    language: 'English',
    tone: 'Melancholic',
    ...overrides
  });

async function postGeneration(
  app: ReturnType<typeof storyApp>,
  body: unknown,
  project = 'p-a'
): Promise<Response> {
  return app.request(`https://app.example/api/v1/projects/${project}/generations`, mutation(body), env);
}

function ledgerCount(type: string, org = 'org-a'): number {
  return (
    db.query('SELECT COUNT(*) AS n FROM credit_ledger WHERE organization_id = ? AND type = ?').get(
      org,
      type
    ) as { n: number }
  ).n;
}

function balance(org = 'org-a'): number {
  const row = db
    .query('SELECT balance FROM credit_accounts WHERE organization_id = ?')
    .get(org) as { balance: number } | null;
  return row?.balance ?? 0;
}

describe('credits — exactly-once 100-credit grant', () => {
  it('issues 100 once and records one grant', async () => {
    const app = storyApp(userA, new FakeProvider());
    const first = await app.request('https://app.example/api/v1/credits', {}, env);
    expect(first.status).toBe(200);
    const firstJson = await first.json();
    expect(firstJson.credits.balance).toBe(100);
    expect(firstJson.credits.plan).toBe('free');
    expect(firstJson.credits.costs).toEqual({ story_bible: 10, episode_script: 15 });

    const second = await app.request('https://app.example/api/v1/credits', {}, env);
    expect((await second.json()).credits.balance).toBe(100);

    expect(ledgerCount('grant')).toBe(1);
    expect(balance()).toBe(100);
  });

  it('is exactly-once under concurrent ensure calls', async () => {
    const d1 = createSqliteD1(db);
    await Promise.all(Array.from({ length: 10 }, () => ensureCreditAccount(d1, 'org-a', NOW)));
    expect(balance()).toBe(100);
    expect(ledgerCount('grant')).toBe(1);
  });

  it('atomically prevents negative balances under concurrent reservations', async () => {
    const d1 = createSqliteD1(db);
    await ensureCreditAccount(d1, 'org-a', NOW);
    for (let i = 0; i < 20; i += 1) {
      db.run(
        `INSERT INTO generation_jobs (id, organization_id, project_id, job_type, status, attempts, max_attempts, idempotency_key)
         VALUES (?, 'org-a', 'p-a', 'story_bible', 'pending', 0, 1, ?)`,
        [`job-conc-${i}`, `key-conc-${i}`]
      );
    }

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => reserveCredits(d1, 'org-a', `job-conc-${i}`, 10, NOW))
    );

    expect(results.filter((result) => result.ok)).toHaveLength(10);
    expect(results.filter((result) => !result.ok && result.reason === 'insufficient_credits')).toHaveLength(10);
    expect(balance()).toBe(0);
    expect(ledgerCount('reserve')).toBe(10);
    expect(
      db.query('SELECT MIN(balance_after) AS min FROM credit_ledger').get() as { min: number }
    ).toEqual({ min: 0 });
  });

  it('releases a hold once and settles idempotently', async () => {
    const d1 = createSqliteD1(db);
    await ensureCreditAccount(d1, 'org-a', NOW);
    db.run(
      `INSERT INTO generation_jobs (id, organization_id, project_id, job_type, status, attempts, max_attempts, idempotency_key)
       VALUES ('job-credit', 'org-a', 'p-a', 'story_bible', 'pending', 0, 1, 'key-credit')`
    );
    await reserveCredits(d1, 'org-a', 'job-credit', 10, NOW);
    await releaseCredits(d1, 'org-a', 'job-credit', NOW);
    await releaseCredits(d1, 'org-a', 'job-credit', NOW);

    expect(balance()).toBe(100);
    expect(ledgerCount('release')).toBe(1);

    db.run(
      `INSERT INTO generation_jobs (id, organization_id, project_id, job_type, status, attempts, max_attempts, idempotency_key)
       VALUES ('job-credit-2', 'org-a', 'p-a', 'story_bible', 'pending', 0, 1, 'key-credit-2')`
    );
    await reserveCredits(d1, 'org-a', 'job-credit-2', 10, NOW);
    await settleCredits(d1, 'org-a', 'job-credit-2', NOW);
    await settleCredits(d1, 'org-a', 'job-credit-2', NOW);

    expect(balance()).toBe(90);
    expect(ledgerCount('settle')).toBe(1);
  });
});

describe('story bible generation', () => {
  it('generates, persists, charges 10 and settles the job', async () => {
    const provider = new FakeProvider();
    const app = storyApp(userA, provider);

    const response = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-story-bible-0001',
      concept: 'A memory broker in a neon city',
      genre: 'Noir',
      tone: 'Melancholic'
    });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.job.status).toBe('succeeded');
    expect(json.job.type).toBe('story_bible');
    expect(json.job.attempts).toBe(1);
    expect(json.job.max_attempts).toBe(1);
    expect(json.job.provider).toBe('gemini');
    expect(json.job.model).toBe('test-model');
    expect(json.output.kind).toBe('story_bible');
    expect(json.output.story_bible.premise).toBe(BIBLE.premise);
    expect(json.output.story_bible.version).toBe(1);
    expect(json.credits.balance).toBe(90);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toContain('A memory broker in a neon city');
    expect(provider.calls[0]).toContain('"premise"');

    // Persistence across a separate HTTP request.
    const read = await app.request('https://app.example/api/v1/projects/p-a/story-bible', {}, env);
    expect(read.status).toBe(200);
    expect((await read.json()).story_bible.synopsis).toBe(BIBLE.synopsis);

    const job = await app.request(`https://app.example/api/v1/jobs/${json.job.id}`, {}, env);
    expect((await job.json()).job.status).toBe('succeeded');

    expect(balance()).toBe(90);
    expect(ledgerCount('reserve')).toBe(1);
    expect(ledgerCount('settle')).toBe(1);
  });

  it('returns a succeeded output for a replayed idempotency key without charging again', async () => {
    const app = storyApp(userA, new FakeProvider());
    const body = {
      type: 'story_bible',
      idempotencyKey: 'key-replay-000001',
      concept: 'A memory broker'
    };

    const first = await postGeneration(app, body);
    expect(first.status).toBe(201);
    const firstJson = await first.json();

    const second = await postGeneration(app, body);
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.duplicate).toBe(true);
    expect(secondJson.job.id).toBe(firstJson.job.id);
    expect(secondJson.output.story_bible.id).toBe(firstJson.output.story_bible.id);
    expect(secondJson.credits.balance).toBe(90);

    expect(
      db.query('SELECT COUNT(*) AS n FROM generation_jobs').get() as { n: number }
    ).toEqual({ n: 1 });
    expect(ledgerCount('reserve')).toBe(1);
  });

  it('deduplicates a concurrent duplicate submission into one job and one charge', async () => {
    const provider = new DeferredProvider();
    const app = storyApp(userA, provider);
    const body = {
      type: 'story_bible',
      idempotencyKey: 'key-concurrent-0001',
      concept: 'Concurrent request'
    };

    const first = postGeneration(app, body);
    for (let attempt = 0; attempt < 50 && provider.calls === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(provider.calls).toBe(1);

    const second = await postGeneration(app, body);
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.duplicate).toBe(true);
    expect(['pending', 'running']).toContain(secondJson.job.status);
    expect(secondJson.output).toBeNull();
    expect(secondJson.credits.balance).toBe(90);

    provider.release();
    const firstResponse = await first;
    expect(firstResponse.status).toBe(201);
    const firstJson = await firstResponse.json();
    expect(firstJson.job.status).toBe('succeeded');
    expect(firstJson.credits.balance).toBe(90);

    expect(provider.calls).toBe(1);
    expect(
      db.query('SELECT COUNT(*) AS n FROM generation_jobs').get() as { n: number }
    ).toEqual({ n: 1 });
    expect(ledgerCount('reserve')).toBe(1);
    expect(ledgerCount('settle')).toBe(1);
  });

  it('preserves prior versions on regeneration and manual save', async () => {
    const app = storyApp(userA, new FakeProvider());
    await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-version-0001',
      concept: 'A memory broker'
    });
    const second = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-version-0002',
      concept: 'A memory broker'
    });
    expect(second.status).toBe(201);
    expect((await second.json()).output.story_bible.version).toBe(2);

    const manual = await app.request(
      'https://app.example/api/v1/projects/p-a/story-bible',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({ ...BIBLE, synopsis: 'Edited by the author.' })
      },
      env
    );
    expect(manual.status).toBe(201);
    const manualJson = await manual.json();
    expect(manualJson.story_bible.version).toBe(3);
    expect(manualJson.story_bible.synopsis).toBe('Edited by the author.');

    expect(
      db.query('SELECT COUNT(*) AS n FROM story_bibles').get() as { n: number }
    ).toEqual({ n: 3 });
    expect(balance()).toBe(80);
  });

  it('rejects invalid manual Story Bible content without saving', async () => {
    const app = storyApp(userA, new FakeProvider());
    const response = await app.request(
      'https://app.example/api/v1/projects/p-a/story-bible',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({ premise: '' })
      },
      env
    );
    expect(response.status).toBe(400);
    expect(
      db.query('SELECT COUNT(*) AS n FROM story_bibles').get() as { n: number }
    ).toEqual({ n: 0 });
  });
});

describe('project profile', () => {
  it('persists description, language and audience across requests and updates in place', async () => {
    const app = storyApp(userA, new FakeProvider());
    const empty = await app.request('https://app.example/api/v1/projects/p-a/profile', {}, env);
    expect(empty.status).toBe(200);
    expect((await empty.json()).profile).toBeNull();

    const save = await app.request(
      'https://app.example/api/v1/projects/p-a/profile',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({
          description: 'A noir memory thriller.',
          language: 'Korean',
          targetAudience: 'Adults 18-34'
        })
      },
      env
    );
    expect(save.status).toBe(200);
    expect((await save.json()).profile).toMatchObject({
      project_id: 'p-a',
      description: 'A noir memory thriller.',
      language: 'Korean',
      target_audience: 'Adults 18-34'
    });

    const read = await app.request('https://app.example/api/v1/projects/p-a/profile', {}, env);
    expect((await read.json()).profile.language).toBe('Korean');

    const update = await app.request(
      'https://app.example/api/v1/projects/p-a/profile',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({ language: 'English' })
      },
      env
    );
    expect((await update.json()).profile).toMatchObject({
      language: 'English',
      description: null,
      target_audience: null
    });
  });

  it('rejects invalid profile fields and another tenant\'s project', async () => {
    const app = storyApp(userA, new FakeProvider());
    const tooLong = await app.request(
      'https://app.example/api/v1/projects/p-a/profile',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({ language: 'x'.repeat(41) })
      },
      env
    );
    expect(tooLong.status).toBe(400);

    const wrongType = await app.request(
      'https://app.example/api/v1/projects/p-a/profile',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({ description: 42 })
      },
      env
    );
    expect(wrongType.status).toBe(400);

    const appB = storyApp(userB, new FakeProvider());
    expect((await appB.request('https://app.example/api/v1/projects/p-a/profile', {}, env)).status).toBe(
      404
    );
    const write = await appB.request(
      'https://app.example/api/v1/projects/p-a/profile',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({ description: 'Hijack' })
      },
      env
    );
    expect(write.status).toBe(404);
    expect(
      db.query('SELECT COUNT(*) AS n FROM project_profiles').get() as { n: number }
    ).toEqual({ n: 0 });
  });
});

describe('episode generation and approval', () => {
  it('generates a ready-for-review episode, charges 15, and approves it once', async () => {
    const app = storyApp(userA, new RoutedProvider());
    // Give the episode a Story Bible context.
    const bible = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-episode-bible-1',
      concept: 'A memory broker'
    });
    expect(bible.status).toBe(201);

    const response = await postGeneration(app, {
      type: 'episode_script',
      idempotencyKey: 'key-episode-000001',
      concept: 'Mira meets the client who knows her',
      episodeNumber: 1
    });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.output.kind).toBe('episode');
    expect(json.output.episode.status).toBe('ready_for_review');
    expect(json.output.episode.version).toBe(1);
    expect(json.output.episode.outline).toHaveLength(3);
    expect(json.credits.balance).toBe(75);

    const list = await app.request('https://app.example/api/v1/projects/p-a/episodes', {}, env);
    const listJson = await list.json();
    expect(listJson.episodes).toHaveLength(1);
    expect(listJson.episodes[0].episode_number).toBe(1);

    const approve = await app.request(
      'https://app.example/api/v1/projects/p-a/episodes/1',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({ status: 'approved' })
      },
      env
    );
    expect(approve.status).toBe(200);
    expect((await approve.json()).episode.status).toBe('approved');

    const again = await app.request(
      'https://app.example/api/v1/projects/p-a/episodes/1',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({ status: 'approved' })
      },
      env
    );
    expect(again.status).toBe(409);
  });

  it('increments the episode version on regeneration', async () => {
    const app = storyApp(userA, new FakeProvider(JSON.stringify(EPISODE)));
    await postGeneration(app, {
      type: 'episode_script',
      idempotencyKey: 'key-episode-v1',
      concept: 'First pass',
      episodeNumber: 2
    });
    const second = await postGeneration(app, {
      type: 'episode_script',
      idempotencyKey: 'key-episode-v2',
      concept: 'Second pass',
      episodeNumber: 2
    });
    expect((await second.json()).output.episode.version).toBe(2);
    expect(
      db.query('SELECT COUNT(*) AS n FROM episodes WHERE episode_number = 2').get() as { n: number }
    ).toEqual({ n: 2 });
    expect(balance()).toBe(70);
  });
});

describe('tenant isolation', () => {
  it('keeps credits, Story Bibles, episodes and jobs scoped to the session tenant', async () => {
    const appA = storyApp(userA, new RoutedProvider());
    const generated = await postGeneration(appA, {
      type: 'story_bible',
      idempotencyKey: 'key-tenant-a-0001',
      concept: 'Tenant A story'
    });
    expect(generated.status).toBe(201);
    const jobId = (await generated.json()).job.id;

    const appB = storyApp(userB, new FakeProvider());
    const bible = await appB.request('https://app.example/api/v1/projects/p-a/story-bible', {}, env);
    expect(bible.status).toBe(404);
    const episodes = await appB.request('https://app.example/api/v1/projects/p-a/episodes', {}, env);
    expect(episodes.status).toBe(404);
    const job = await appB.request(`https://app.example/api/v1/jobs/${jobId}`, {}, env);
    expect(job.status).toBe(404);
    const generate = await postGeneration(
      appB,
      { type: 'story_bible', idempotencyKey: 'key-tenant-b-0001', concept: 'Hijack' },
      'p-a'
    );
    expect(generate.status).toBe(404);
    const bibleWrite = await appB.request(
      'https://app.example/api/v1/projects/p-a/story-bible',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify(BIBLE)
      },
      env
    );
    expect(bibleWrite.status).toBe(404);
    const approve = await appB.request(
      'https://app.example/api/v1/projects/p-a/episodes/1',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
        body: JSON.stringify({ status: 'approved' })
      },
      env
    );
    expect(approve.status).toBe(404);
    const ownCredits = await appB.request('https://app.example/api/v1/credits', {}, env);
    expect((await ownCredits.json()).credits.balance).toBe(100);
    expect(balance('org-a')).toBe(90);
  });

  it('ignores forged ownership, plan and balance fields', async () => {
    const app = storyApp(userA, new FakeProvider());
    const response = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-forged-00001',
      concept: 'Legitimate',
      organization_id: 'org-b',
      created_by_sub: 'sub-b',
      plan: 'paid',
      balance: 999999,
      cost: 0
    });
    expect(response.status).toBe(201);
    const job = (await response.json()).job;
    const row = db
      .query('SELECT organization_id, created_by_sub FROM generation_jobs WHERE id = ?')
      .get(job.id) as { organization_id: string; created_by_sub: string };
    expect(row).toEqual({ organization_id: 'org-a', created_by_sub: 'sub-a' });
    expect(balance('org-a')).toBe(90);
    expect(balance('org-b')).toBe(0);
  });
});

describe('honest failure states', () => {
  it('returns provider_not_configured with no job and no charge', async () => {
    const app = storyApp(userA, null);
    const response = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-no-provider-1',
      concept: 'No provider'
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('provider_not_configured');
    expect(
      db.query('SELECT COUNT(*) AS n FROM generation_jobs').get() as { n: number }
    ).toEqual({ n: 0 });
    expect(balance()).toBe(0);
    const credits = await app.request('https://app.example/api/v1/credits', {}, env);
    expect((await credits.json()).credits.balance).toBe(100);
  });

  it('fails malformed provider output, releases the hold, and saves nothing', async () => {
    const app = storyApp(userA, new FakeProvider('not valid json'));
    const response = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-bad-output-1',
      concept: 'Bad output'
    });
    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error).toBe('provider_bad_response');
    expect(json.job.status).toBe('failed');
    expect(json.credits.balance).toBe(100);
    expect(
      db.query('SELECT COUNT(*) AS n FROM story_bibles').get() as { n: number }
    ).toEqual({ n: 0 });
    expect(ledgerCount('release')).toBe(1);
    expect(ledgerCount('settle')).toBe(0);
  });

  it('maps rate limiting to 429 and releases the reservation', async () => {
    const provider = new FakeProvider(() => {
      throw new AiProviderError('provider_rate_limited', 'Rate limited.');
    });
    const app = storyApp(userA, provider);
    const response = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-rate-limit-1',
      concept: 'Rate limited'
    });
    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.error).toBe('provider_rate_limited');
    expect(json.job.status).toBe('failed');
    expect(json.credits.balance).toBe(100);
  });

  it('maps provider timeout to 504 and releases the reservation', async () => {
    const provider = new FakeProvider(() => {
      throw new AiProviderError('provider_timeout', 'Timed out.');
    });
    const app = storyApp(userA, provider);
    const response = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-timeout-0001',
      concept: 'Slow'
    });
    expect(response.status).toBe(504);
    expect((await response.json()).credits.balance).toBe(100);
  });

  it('rejects insufficient credits without going negative', async () => {
    const app = storyApp(userA, new FakeProvider());
    await app.request('https://app.example/api/v1/credits', {}, env);
    db.run("UPDATE credit_accounts SET balance = 5 WHERE organization_id = 'org-a'");

    const response = await postGeneration(app, {
      type: 'story_bible',
      idempotencyKey: 'key-broke-000001',
      concept: 'Cannot afford'
    });
    expect(response.status).toBe(402);
    const json = await response.json();
    expect(json.error).toBe('insufficient_credits');
    expect(json.job.status).toBe('failed');
    expect(json.credits.balance).toBe(5);
    expect(balance()).toBe(5);
    expect(
      db.query('SELECT COUNT(*) AS n FROM story_bibles').get() as { n: number }
    ).toEqual({ n: 0 });
  });

  it('rejects image, voice and video for the free plan before any job or charge', async () => {
    const app = storyApp(userA, new FakeProvider());
    for (const type of ['image', 'voice', 'video']) {
      const response = await postGeneration(app, {
        type,
        idempotencyKey: `key-media-${type}-1`,
        concept: 'Paid media'
      });
      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe('plan_restricted');
    }
    expect(
      db.query('SELECT COUNT(*) AS n FROM generation_jobs').get() as { n: number }
    ).toEqual({ n: 0 });
    expect(balance()).toBe(0);
  });
});

describe('request validation and authentication', () => {
  it('requires a valid idempotency key and type', async () => {
    const app = storyApp(userA, new FakeProvider());
    expect(
      (await postGeneration(app, { type: 'story_bible', idempotencyKey: 'short', concept: 'x' })).status
    ).toBe(400);
    expect(
      (await postGeneration(app, { type: 'unknown', idempotencyKey: 'key-unknown-001', concept: 'x' }))
        .status
    ).toBe(400);
    expect(
      (await postGeneration(app, { type: 'story_bible', idempotencyKey: 'key-no-concept-1' })).status
    ).toBe(400);
  });

  it('rejects every story route without a session', async () => {
    const app = storyApp(null, new FakeProvider());
    const routes: Array<{ path: string; init?: RequestInit }> = [
      { path: '/api/v1/credits' },
      { path: '/api/v1/projects/p-a/profile' },
      { path: '/api/v1/projects/p-a/story-bible' },
      {
        path: '/api/v1/projects/p-a/story-bible',
        init: {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
          body: JSON.stringify(BIBLE)
        }
      },
      { path: '/api/v1/projects/p-a/episodes' },
      { path: '/api/v1/jobs/job-x' },
      {
        path: '/api/v1/projects/p-a/generations',
        init: mutation({
          type: 'story_bible',
          idempotencyKey: 'key-unauth-0001',
          concept: 'No session'
        })
      }
    ];
    for (const route of routes) {
      const response = await app.request(`https://app.example${route.path}`, route.init ?? {}, env);
      expect(response.status).toBe(401);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    }
  });
});

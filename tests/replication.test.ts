import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { D1DatabaseLike } from '../worker/src/env';
import {
  DuplicateTargetError,
  enqueueReplication,
  idempotencyKeyFor,
  runReplicationBatch,
  type ReplicationRecord,
  type SecondaryTarget
} from '../worker/src/replication';
import { createSqliteD1 } from './helpers/d1';

/**
 * Replication tests (TASK-IMPLEMENT-SHARED-FOUNDATION).
 *
 * A successful backup is only claimed after the secondary confirms it; retries,
 * duplicate suppression and the last-success marker are all exercised against
 * the real migration SQL.
 */

const MIGRATIONS = ['0001_init_tenancy.sql', '0002_assets_and_replication.sql'].map((file) =>
  readFileSync(join(import.meta.dir, '..', 'db', 'migrations', file), 'utf8')
);

let raw: Database;
let db: D1DatabaseLike;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  for (const sql of MIGRATIONS) raw.exec(sql);
  db = createSqliteD1(raw);
});

function enqueue(overrides: Partial<Parameters<typeof enqueueReplication>[1]> = {}) {
  return enqueueReplication(db, {
    target: 'supabase',
    table: 'projects',
    id: 'p-a',
    organizationId: 'org-a',
    operation: 'upsert',
    payload: { id: 'p-a', title: 'A', status: 'draft', updated_at: '2026-10-23T00:00:00Z' },
    updatedAt: '2026-10-23T00:00:00Z',
    ...overrides
  });
}

type Recorded = { records: ReplicationRecord[]; attempts: number };

function fakeTarget(behaviour: (call: number) => void = () => {}): SecondaryTarget & Recorded {
  const target: SecondaryTarget & Recorded = {
    name: 'supabase',
    records: [],
    attempts: 0,
    async apply(record) {
      target.attempts += 1;
      target.records.push(record);
      behaviour(target.attempts);
    }
  };
  return target;
}

function state(target = 'supabase') {
  return raw
    .query('SELECT last_success_at, last_attempt_at, last_error, pending_count FROM replication_state WHERE target = ?')
    .get(target) as
    | { last_success_at: string | null; last_attempt_at: string | null; last_error: string | null; pending_count: number }
    | undefined;
}

const NOW = new Date('2026-10-23T12:00:00Z');

describe('enqueueReplication', () => {
  it('derives a stable idempotency key from identity + version', async () => {
    const { idempotencyKey } = await enqueue();
    expect(idempotencyKey).toBe('projects:p-a:2026-10-23T00:00:00Z');
  });

  it('ignores a duplicate version instead of queueing it twice', async () => {
    await enqueue({ outboxId: 'o1' });
    await enqueue({ outboxId: 'o2' });
    const row = raw
      .query('SELECT COUNT(*) AS n FROM replication_outbox')
      .get() as { n: number };
    expect(row.n).toBe(1);
  });

  it('queues a new version of the same record', async () => {
    await enqueue();
    await enqueue({ updatedAt: '2026-10-23T01:00:00Z' });
    const row = raw
      .query('SELECT COUNT(*) AS n FROM replication_outbox')
      .get() as { n: number };
    expect(row.n).toBe(2);
  });
});

describe('runReplicationBatch', () => {
  it('replicates pending rows and records the last success', async () => {
    await enqueue();
    await enqueue({ id: 'p-b', updatedAt: '2026-10-23T02:00:00Z' });
    const target = fakeTarget();

    const run = await runReplicationBatch(db, target, { now: () => NOW });

    expect(run.attempted).toBe(2);
    expect(run.replicated).toBe(2);
    expect(run.failed).toBe(0);
    expect(run.pendingCount).toBe(0);
    expect(run.lastSuccessAt).toBe('2026-10-23T12:00:00Z');
    expect(target.records.map((r) => r.id)).toEqual(['p-a', 'p-b']);

    const row = raw
      .query('SELECT replicated_at, attempts, last_error FROM replication_outbox WHERE entity_id = ?')
      .get('p-a') as { replicated_at: string | null; attempts: number; last_error: string | null };
    expect(row.replicated_at).toBe('2026-10-23T12:00:00Z');
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBeNull();

    expect(state()).toMatchObject({
      last_success_at: '2026-10-23T12:00:00Z',
      last_error: null,
      pending_count: 0
    });
  });

  it('is idempotent across repeated runs', async () => {
    await enqueue();
    const target = fakeTarget();

    await runReplicationBatch(db, target, { now: () => NOW });
    const second = await runReplicationBatch(db, target, { now: () => NOW });

    expect(target.attempts).toBe(1);
    expect(second.attempted).toBe(0);
    expect(second.lastSuccessAt).toBe('2026-10-23T12:00:00Z');
  });

  it('treats a duplicate target error as an idempotent success', async () => {
    await enqueue();
    const target = fakeTarget(() => {
      throw new DuplicateTargetError();
    });

    const run = await runReplicationBatch(db, target, { now: () => NOW });

    expect(run.duplicates).toBe(1);
    expect(run.failed).toBe(0);
    expect(run.lastSuccessAt).toBe('2026-10-23T12:00:00Z');
    expect(state()?.pending_count).toBe(0);
  });

  it('retries transient failures with exponential backoff, then succeeds', async () => {
    await enqueue();
    const delays: number[] = [];
    const target = fakeTarget((call) => {
      if (call < 3) throw new Error(`temporary ${call}`);
    });

    const run = await runReplicationBatch(db, target, {
      now: () => NOW,
      maxAttempts: 3,
      baseDelayMs: 10,
      sleep: async (ms) => {
        delays.push(ms);
      }
    });

    expect(delays).toEqual([10, 20]);
    expect(run.results[0]).toMatchObject({ status: 'replicated', attempts: 3 });
    expect(state()?.last_success_at).toBe('2026-10-23T12:00:00Z');
  });

  it('records exhausted failures without claiming success', async () => {
    await enqueue();
    raw
      .query(
        `INSERT INTO replication_state (target, last_success_at, last_attempt_at, last_error, pending_count)
         VALUES ('supabase', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, 1)`
      )
      .run();
    const target = fakeTarget(() => {
      throw new Error('secondary down');
    });

    const run = await runReplicationBatch(db, target, {
      now: () => NOW,
      maxAttempts: 2,
      baseDelayMs: 0,
      sleep: async () => {}
    });

    expect(run.failed).toBe(1);
    expect(run.replicated).toBe(0);
    expect(run.lastSuccessAt).toBe('2026-01-01T00:00:00Z');

    const row = raw
      .query('SELECT replicated_at, attempts, last_error FROM replication_outbox WHERE entity_id = ?')
      .get('p-a') as { replicated_at: string | null; attempts: number; last_error: string | null };
    expect(row.replicated_at).toBeNull();
    expect(row.attempts).toBe(2);
    expect(row.last_error).toBe('secondary down');

    const current = state();
    expect(current?.last_success_at).toBe('2026-01-01T00:00:00Z');
    expect(current?.last_error).toBe('secondary down');
    expect(current?.pending_count).toBe(1);
  });

  it('honours the batch size and leaves the rest pending', async () => {
    await enqueue({ id: 'p-1', updatedAt: '2026-10-23T00:00:01Z' });
    await enqueue({ id: 'p-2', updatedAt: '2026-10-23T00:00:02Z' });
    await enqueue({ id: 'p-3', updatedAt: '2026-10-23T00:00:03Z' });
    const target = fakeTarget();

    const run = await runReplicationBatch(db, target, { batchSize: 2, now: () => NOW });

    expect(run.attempted).toBe(2);
    expect(run.pendingCount).toBe(1);
  });

  it('passes delete operations and payloads through intact', async () => {
    await enqueue({
      operation: 'delete',
      table: 'assets',
      id: 'asset-1',
      payload: { id: 'asset-1', updated_at: '2026-10-23T00:00:00Z' }
    });
    const target = fakeTarget();

    await runReplicationBatch(db, target, { now: () => NOW });

    expect(target.records[0]).toMatchObject({
      table: 'assets',
      id: 'asset-1',
      operation: 'delete',
      idempotencyKey: 'assets:asset-1:2026-10-23T00:00:00Z'
    });
  });
});

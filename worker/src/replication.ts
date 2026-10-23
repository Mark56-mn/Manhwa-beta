import type { D1DatabaseLike } from './env';

/**
 * Secondary-backup replication (TASK-IMPLEMENT-SHARED-FOUNDATION).
 *
 * The authoritative database is D1. Supabase Postgres is a SECONDARY backup:
 * it is never read for authorization and never becomes a competing primary.
 *
 * Guarantees implemented here:
 *  - "saved to primary" and "replicated to backup" are distinct facts: a row
 *    is marked replicated only after the secondary target confirms the write.
 *  - retries with exponential backoff inside one bounded batch run;
 *  - duplicate protection via a stable idempotency key
 *    (entity_table:entity_id:updated_at) plus a UNIQUE (target, key) index;
 *  - a per-target last-successful-replication marker that a failed run can
 *    never advance;
 *  - failures are recorded per row with a sanitized message.
 *
 * This module is intentionally not scheduled or wired into request handlers in
 * this task: migration 0002 is not applied to any live database, so enqueueing
 * outbox rows in production routes would fail. Wiring the trigger and the cron
 * is the documented next step, gated on owner authorization.
 */

export type ReplicableTable = 'projects' | 'assets';
export type ReplicationOperation = 'upsert' | 'delete';

export interface ReplicationRecord {
  table: ReplicableTable;
  id: string;
  organizationId: string;
  operation: ReplicationOperation;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  updatedAt: string;
}

export interface SecondaryTarget {
  /** Stable target name, e.g. 'supabase'. Used as the outbox partition key. */
  name: string;
  apply(record: ReplicationRecord): Promise<void>;
}

/** Signals that the secondary already holds this idempotency key. */
export class DuplicateTargetError extends Error {
  constructor(message = 'Record was already applied to the secondary target.') {
    super(message);
    this.name = 'DuplicateTargetError';
  }
}

export interface OutboxRow {
  id: string;
  target: string;
  entity_table: ReplicableTable;
  entity_id: string;
  organization_id: string;
  operation: ReplicationOperation;
  payload: string;
  idempotency_key: string;
  created_at: string;
  attempts: number;
}

export interface EnqueueInput {
  target: string;
  table: ReplicableTable;
  id: string;
  organizationId: string;
  operation: ReplicationOperation;
  payload: Record<string, unknown>;
  updatedAt: string;
  outboxId?: string;
}

export interface ReplicationOptions {
  batchSize?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface ReplicationItemResult {
  outboxId: string;
  table: ReplicableTable;
  entityId: string;
  operation: ReplicationOperation;
  idempotencyKey: string;
  status: 'replicated' | 'duplicate' | 'failed';
  attempts: number;
  error?: string;
}

export interface ReplicationRunResult {
  target: string;
  attempted: number;
  replicated: number;
  duplicates: number;
  failed: number;
  lastSuccessAt: string | null;
  pendingCount: number;
  results: ReplicationItemResult[];
}

const MAX_ERROR_LENGTH = 500;

export function idempotencyKeyFor(
  table: ReplicableTable,
  id: string,
  updatedAt: string
): string {
  return `${table}:${id}:${updatedAt}`;
}

function isoTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function sanitizeError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  return message.slice(0, MAX_ERROR_LENGTH);
}

function toRecord(row: OutboxRow): ReplicationRecord {
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.payload);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = {};
  }
  return {
    table: row.entity_table,
    id: row.entity_id,
    organizationId: row.organization_id,
    operation: row.operation,
    payload,
    idempotencyKey: row.idempotency_key,
    updatedAt:
      typeof payload.updated_at === 'string' ? payload.updated_at : row.idempotency_key
  };
}

/** Queue one record version. Re-enqueueing the same version is a no-op. */
export async function enqueueReplication(
  db: D1DatabaseLike,
  input: EnqueueInput
): Promise<{ idempotencyKey: string; outboxId: string }> {
  const idempotencyKey = idempotencyKeyFor(input.table, input.id, input.updatedAt);
  const outboxId = input.outboxId ?? `outbox-${crypto.randomUUID()}`;
  await db
    .prepare(
      `INSERT OR IGNORE INTO replication_outbox
         (id, target, entity_table, entity_id, organization_id, operation, payload, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      outboxId,
      input.target,
      input.table,
      input.id,
      input.organizationId,
      input.operation,
      JSON.stringify(input.payload),
      idempotencyKey
    )
    .run();
  return { idempotencyKey, outboxId };
}

async function pendingCount(db: D1DatabaseLike, target: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM replication_outbox WHERE target = ? AND replicated_at IS NULL`
    )
    .bind(target)
    .first<{ n: number } | null>();
  return row?.n ?? 0;
}

/**
 * Replicate one bounded batch of pending rows to the secondary target.
 * Safe to call repeatedly; already-replicated rows are skipped.
 */
export async function runReplicationBatch(
  db: D1DatabaseLike,
  target: SecondaryTarget,
  options: ReplicationOptions = {}
): Promise<ReplicationRunResult> {
  const batchSize = options.batchSize ?? 25;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 100);
  const now = options.now ?? (() => new Date());
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const stateRow = await db
    .prepare(`SELECT last_success_at FROM replication_state WHERE target = ?`)
    .bind(target.name)
    .first<{ last_success_at: string | null } | null>();
  const previousSuccess = stateRow?.last_success_at ?? null;

  const rows = await db
    .prepare(
      `SELECT id, target, entity_table, entity_id, organization_id, operation, payload,
              idempotency_key, created_at, attempts
       FROM replication_outbox
       WHERE target = ? AND replicated_at IS NULL
       ORDER BY created_at, id
       LIMIT ?`
    )
    .bind(target.name, batchSize)
    .all<OutboxRow>();

  const results: ReplicationItemResult[] = [];

  for (const row of (rows ?? []) as OutboxRow[]) {
    const record = toRecord(row);
    let status: ReplicationItemResult['status'] = 'failed';
    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < maxAttempts) {
      attempts += 1;
      try {
        await target.apply(record);
        status = 'replicated';
        lastError = undefined;
        break;
      } catch (error) {
        if (
          error instanceof DuplicateTargetError ||
          (typeof error === 'object' &&
            error !== null &&
            (error as { code?: string }).code === 'duplicate')
        ) {
          // The secondary already has this version: an idempotent success.
          status = 'duplicate';
          lastError = undefined;
          break;
        }
        lastError = sanitizeError(error);
        if (attempts < maxAttempts) {
          await sleep(Math.min(baseDelayMs * 2 ** (attempts - 1), 5_000));
        }
      }
    }

    if (status === 'failed') {
      await db
        .prepare(
          `UPDATE replication_outbox
           SET attempts = attempts + ?, last_error = ?
           WHERE id = ? AND replicated_at IS NULL`
        )
        .bind(attempts, lastError ?? 'Unknown error', row.id)
        .run();
    } else {
      await db
        .prepare(
          `UPDATE replication_outbox
           SET attempts = attempts + ?, last_error = NULL, replicated_at = ?
           WHERE id = ?`
        )
        .bind(attempts, isoTimestamp(now()), row.id)
        .run();
    }

    results.push({
      outboxId: row.id,
      table: row.entity_table,
      entityId: row.entity_id,
      operation: row.operation,
      idempotencyKey: row.idempotency_key,
      status,
      attempts,
      ...(lastError ? { error: lastError } : {})
    });
  }

  const succeeded = results.filter((result) => result.status !== 'failed');
  const failures = results.filter((result) => result.status === 'failed');
  const lastSuccessAt =
    succeeded.length > 0 ? isoTimestamp(now()) : previousSuccess;

  const pending = await pendingCount(db, target.name);
  await db
    .prepare(
      `INSERT INTO replication_state
         (target, last_success_at, last_attempt_at, last_error, pending_count)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (target) DO UPDATE SET
         last_success_at = excluded.last_success_at,
         last_attempt_at = excluded.last_attempt_at,
         last_error      = excluded.last_error,
         pending_count   = excluded.pending_count`
    )
    .bind(
      target.name,
      lastSuccessAt,
      isoTimestamp(now()),
      failures.length > 0 ? (failures[0].error ?? 'Replication failed.') : null,
      pending
    )
    .run();

  return {
    target: target.name,
    attempted: results.length,
    replicated: results.filter((result) => result.status === 'replicated').length,
    duplicates: results.filter((result) => result.status === 'duplicate').length,
    failed: failures.length,
    lastSuccessAt,
    pendingCount: pending,
    results
  };
}

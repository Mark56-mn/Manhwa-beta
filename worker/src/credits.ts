import type { D1DatabaseLike } from './env';

/**
 * Server-owned writing credits (TASK 04).
 *
 * Rules enforced here, never in the browser:
 *  - every organization on the free plan receives exactly 100 initial writing
 *    credits, once (atomic conditional update + idempotent ledger key);
 *  - credits are reserved before provider work, settled after a validated save,
 *    and released when a job fails without billable output;
 *  - the balance can never go negative (single conditional UPDATE);
 *  - the ledger is append-only and idempotent per (organization, key);
 *  - media features are not purchasable with writing credits (see story routes).
 */

export const INITIAL_FREE_CREDITS = 100;
export const CREDIT_COSTS = { story_bible: 10, episode_script: 15 } as const;
export type CreditCostKey = keyof typeof CREDIT_COSTS;

export type CreditLedgerType = 'grant' | 'reserve' | 'settle' | 'release';

export interface CreditAccount {
  organizationId: string;
  plan: 'free' | 'paid';
  balance: number;
  initialGrantedAt: string | null;
}

export interface CreditLedgerEntry {
  type: CreditLedgerType;
  amount: number;
  balance_after: number;
  idempotency_key: string;
  job_id: string | null;
  reason: string;
  created_at: string;
}

export interface ReserveResult {
  ok: boolean;
  balance: number;
  reason?: 'insufficient_credits' | 'hold_closed';
}

function isoTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** D1's run() reports affected rows in `meta.changes`; tests mirror that. */
function changedRows(result: unknown): number {
  if (typeof result !== 'object' || result === null) return 0;
  const meta = (result as { meta?: { changes?: unknown } }).meta;
  return typeof meta?.changes === 'number' ? meta.changes : 0;
}

async function readAccount(
  db: D1DatabaseLike,
  organizationId: string
): Promise<CreditAccount | null> {
  const row = await db
    .prepare(
      `SELECT organization_id, plan, balance, initial_granted_at
       FROM credit_accounts WHERE organization_id = ?`
    )
    .bind(organizationId)
    .first<{
      organization_id: string;
      plan: 'free' | 'paid';
      balance: number;
      initial_granted_at: string | null;
    } | null>();
  if (!row) return null;
  return {
    organizationId: row.organization_id,
    plan: row.plan,
    balance: row.balance,
    initialGrantedAt: row.initial_granted_at
  };
}

export async function getBalance(db: D1DatabaseLike, organizationId: string): Promise<number> {
  const account = await readAccount(db, organizationId);
  return account?.balance ?? 0;
}

/**
 * Create the account if needed and issue the one-time 100-credit grant.
 * Concurrency-safe: only one UPDATE can win `initial_granted_at IS NULL`;
 * the ledger insert is idempotent on `grant:initial:<org>`.
 */
export async function ensureCreditAccount(
  db: D1DatabaseLike,
  organizationId: string,
  now: Date = new Date()
): Promise<CreditAccount> {
  const at = isoTimestamp(now);

  await db
    .prepare(
      `INSERT OR IGNORE INTO credit_accounts
         (organization_id, plan, balance, created_at, updated_at)
       VALUES (?, 'free', 0, ?, ?)`
    )
    .bind(organizationId, at, at)
    .run();

  await db
    .prepare(
      `UPDATE credit_accounts
       SET balance = balance + ?, initial_granted_at = ?, updated_at = ?
       WHERE organization_id = ? AND initial_granted_at IS NULL`
    )
    .bind(INITIAL_FREE_CREDITS, at, at, organizationId)
    .run();

  const account = (await readAccount(db, organizationId)) ?? {
    organizationId,
    plan: 'free' as const,
    balance: 0,
    initialGrantedAt: null
  };

  // Attempted on every call: if a previous process updated the balance but
  // crashed before writing the ledger, this repairs the history without
  // granting twice (the key is unique).
  await db
    .prepare(
      `INSERT OR IGNORE INTO credit_ledger
         (id, organization_id, type, amount, balance_after, idempotency_key, reason)
       VALUES (?, ?, 'grant', ?, ?, ?, ?)`
    )
    .bind(
      `ledger-${crypto.randomUUID()}`,
      organizationId,
      INITIAL_FREE_CREDITS,
      account.balance,
      `grant:initial:${organizationId}`,
      'Initial free-plan writing credits'
    )
    .run();

  return account;
}

export async function creditHistory(
  db: D1DatabaseLike,
  organizationId: string,
  limit = 50
): Promise<CreditLedgerEntry[]> {
  const rows = await db
    .prepare(
      `SELECT type, amount, balance_after, idempotency_key, job_id, reason, created_at
       FROM credit_ledger WHERE organization_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .bind(organizationId, limit)
    .all<CreditLedgerEntry>();
  return (rows ?? []) as CreditLedgerEntry[];
}

/**
 * Reserve credits for a job. The UNIQUE job_id hold makes this idempotent; the
 * conditional balance UPDATE makes it atomic, so concurrent requests cannot
 * overdraw the account.
 */
export async function reserveCredits(
  db: D1DatabaseLike,
  organizationId: string,
  jobId: string,
  cost: number,
  now: Date = new Date()
): Promise<ReserveResult> {
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new Error('Credit cost must be a positive integer.');
  }
  const at = isoTimestamp(now);

  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO credit_holds
         (id, organization_id, job_id, amount, status, created_at)
       VALUES (?, ?, ?, ?, 'held', ?)`
    )
    .bind(`hold-${crypto.randomUUID()}`, organizationId, jobId, cost, at)
    .run();

  if (changedRows(inserted) === 0) {
    const existing = await db
      .prepare(
        `SELECT status FROM credit_holds WHERE organization_id = ? AND job_id = ?`
      )
      .bind(organizationId, jobId)
      .first<{ status: 'held' | 'settled' | 'released' } | null>();
    if (existing?.status === 'held') {
      return { ok: true, balance: await getBalance(db, organizationId) };
    }
    return {
      ok: false,
      balance: await getBalance(db, organizationId),
      reason: 'hold_closed'
    };
  }

  const debited = await db
    .prepare(
      `UPDATE credit_accounts
       SET balance = balance - ?, updated_at = ?
       WHERE organization_id = ? AND balance >= ?`
    )
    .bind(cost, at, organizationId, cost)
    .run();

  if (changedRows(debited) === 0) {
    await db
      .prepare(`DELETE FROM credit_holds WHERE organization_id = ? AND job_id = ?`)
      .bind(organizationId, jobId)
      .run();
    return {
      ok: false,
      balance: await getBalance(db, organizationId),
      reason: 'insufficient_credits'
    };
  }

  const balance = await getBalance(db, organizationId);
  await db
    .prepare(
      `INSERT OR IGNORE INTO credit_ledger
         (id, organization_id, type, amount, balance_after, idempotency_key, job_id, reason)
       VALUES (?, ?, 'reserve', ?, ?, ?, ?, ?)`
    )
    .bind(
      `ledger-${crypto.randomUUID()}`,
      organizationId,
      -cost,
      balance,
      `reserve:${jobId}`,
      jobId,
      'Reserved for generation'
    )
    .run();

  return { ok: true, balance };
}

/** Confirm reserved usage after the output was validated and persisted. */
export async function settleCredits(
  db: D1DatabaseLike,
  organizationId: string,
  jobId: string,
  now: Date = new Date()
): Promise<void> {
  const at = isoTimestamp(now);
  const updated = await db
    .prepare(
      `UPDATE credit_holds SET status = 'settled', settled_at = ?
       WHERE organization_id = ? AND job_id = ? AND status = 'held'`
    )
    .bind(at, organizationId, jobId)
    .run();

  if (changedRows(updated) === 0) return;

  const balance = await getBalance(db, organizationId);
  await db
    .prepare(
      `INSERT OR IGNORE INTO credit_ledger
         (id, organization_id, type, amount, balance_after, idempotency_key, job_id, reason)
       VALUES (?, ?, 'settle', 0, ?, ?, ?, ?)`
    )
    .bind(
      `ledger-${crypto.randomUUID()}`,
      organizationId,
      balance,
      `settle:${jobId}`,
      jobId,
      'Reserved credits confirmed after a validated save'
    )
    .run();
}

/** Refund a held reservation when a job produced no billable output. */
export async function releaseCredits(
  db: D1DatabaseLike,
  organizationId: string,
  jobId: string,
  now: Date = new Date()
): Promise<void> {
  const at = isoTimestamp(now);
  const hold = await db
    .prepare(
      `SELECT amount, status FROM credit_holds WHERE organization_id = ? AND job_id = ?`
    )
    .bind(organizationId, jobId)
    .first<{ amount: number; status: 'held' | 'settled' | 'released' } | null>();
  if (!hold || hold.status !== 'held') return;

  const released = await db
    .prepare(
      `UPDATE credit_holds SET status = 'released', settled_at = ?
       WHERE organization_id = ? AND job_id = ? AND status = 'held'`
    )
    .bind(at, organizationId, jobId)
    .run();
  if (changedRows(released) === 0) return;

  await db
    .prepare(
      `UPDATE credit_accounts
       SET balance = balance + ?, updated_at = ?
       WHERE organization_id = ?`
    )
    .bind(hold.amount, at, organizationId)
    .run();

  const balance = await getBalance(db, organizationId);
  await db
    .prepare(
      `INSERT OR IGNORE INTO credit_ledger
         (id, organization_id, type, amount, balance_after, idempotency_key, job_id, reason)
       VALUES (?, ?, 'release', ?, ?, ?, ?, ?)`
    )
    .bind(
      `ledger-${crypto.randomUUID()}`,
      organizationId,
      hold.amount,
      balance,
      `release:${jobId}`,
      jobId,
      'Reservation released: no billable output'
    )
    .run();
}

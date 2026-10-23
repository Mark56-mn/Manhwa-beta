-- Manhwa Studio — assets schema reconciliation + backup bookkeeping
-- (TASK-IMPLEMENT-SHARED-FOUNDATION)
--
-- READ-ONLY PREPARATION: this file is NOT applied by this task. Applying it to
-- any live database (Freebuff-managed D1 or the owner's own D1) requires the
-- owner's explicit authorization.
--
-- Why this migration exists:
--   1. `worker/src/assets.ts` has queried an `assets` table since TASK 12, but
--      no migration in `migrations/` ever created it. The repository history
--      therefore could not reproduce the schema the code depends on. This is
--      the concrete schema-drift finding of the foundation task.
--   2. Replication to the secondary Postgres backup needs a durable outbox,
--      stable idempotency keys, per-attempt state and a last-success marker.
--
-- Idempotency: every statement is IF NOT EXISTS so applying this to a database
-- where TASK 12 created `assets` manually is safe. It creates no rows, changes
-- no existing data and has no down-migration (consistent with 0001).

CREATE TABLE IF NOT EXISTS assets (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  r2_key          TEXT NOT NULL UNIQUE,
  filename        TEXT NOT NULL,
  content_type    TEXT NOT NULL,
  size            INTEGER NOT NULL CHECK (size >= 0),
  etag            TEXT,
  created_by_sub  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_assets_org      ON assets (organization_id);
CREATE INDEX IF NOT EXISTS idx_assets_project  ON assets (project_id);

-- One row per record version that must reach the secondary backup.
-- `idempotency_key` is derived from stable identity + version
-- (entity_table:entity_id:updated_at), so replaying a batch cannot duplicate.
CREATE TABLE IF NOT EXISTS replication_outbox (
  id              TEXT PRIMARY KEY,
  target          TEXT NOT NULL,                 -- e.g. 'supabase'
  entity_table    TEXT NOT NULL CHECK (entity_table IN ('projects', 'assets')),
  entity_id       TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  operation       TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload         TEXT NOT NULL,                 -- JSON snapshot of the row
  idempotency_key TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error      TEXT,                          -- sanitized message, never a secret
  replicated_at   TEXT,                          -- set ONLY after the secondary confirms
  UNIQUE (target, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON replication_outbox (target, replicated_at, created_at);

-- Last-successful-replication marker per target. A failed batch must never
-- advance `last_success_at`; backup success is distinct from primary save.
CREATE TABLE IF NOT EXISTS replication_state (
  target          TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_attempt_at TEXT,
  last_error      TEXT,
  pending_count   INTEGER NOT NULL DEFAULT 0 CHECK (pending_count >= 0)
);

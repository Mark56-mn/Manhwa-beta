-- Manhwa Studio — persistent story generation, durable jobs and credits
-- (TASK-04). ADDITIVE AND UNAPPLIED: applying this to any live database
-- requires the owner's explicit authorization. Every statement is safe to
-- re-run (CREATE ... IF NOT EXISTS); no existing row is modified or deleted.

-- Project profile fields live in their own table so this migration never has
-- to ALTER an existing table (SQLite has no ADD COLUMN IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS project_profiles (
  project_id      TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  description     TEXT,
  language        TEXT,
  target_audience TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Versioned Story Bible. Every regeneration/manual save adds a version and
-- never overwrites a prior one. Array/object fields are JSON text.
CREATE TABLE IF NOT EXISTS story_bibles (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL CHECK (version > 0),
  premise         TEXT NOT NULL,
  synopsis        TEXT NOT NULL,
  worldbuilding   TEXT NOT NULL,
  world_rules     TEXT NOT NULL,
  characters      TEXT NOT NULL,
  locations       TEXT NOT NULL,
  factions        TEXT NOT NULL,
  timeline        TEXT NOT NULL,
  continuity      TEXT NOT NULL,
  themes          TEXT NOT NULL,
  tone            TEXT NOT NULL,
  structure       TEXT NOT NULL,
  arcs            TEXT NOT NULL,
  created_by_sub  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (project_id, version)
);

-- Versioned episode/chapter. Only validated output is inserted, as
-- `ready_for_review`; a failed generation leaves no episode row and is recorded
-- on the job instead. The other statuses are reserved for later review stages.
CREATE TABLE IF NOT EXISTS episodes (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode_number  INTEGER NOT NULL CHECK (episode_number > 0),
  version         INTEGER NOT NULL CHECK (version > 0),
  title           TEXT NOT NULL,
  outline         TEXT NOT NULL,
  script          TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('draft','generating','ready_for_review','failed','approved')),
  job_id          TEXT,
  created_by_sub  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (project_id, episode_number, version)
);

-- Durable job record for a single bounded attempt. Idempotency is enforced per
-- organization; no scheduler is wired in this task (execution is synchronous).
CREATE TABLE IF NOT EXISTS generation_jobs (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_type        TEXT NOT NULL CHECK (job_type IN ('story_bible','episode_script')),
  status          TEXT NOT NULL CHECK (status IN ('pending','running','succeeded','failed')),
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts    INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  idempotency_key TEXT NOT NULL,
  error_code      TEXT,
  provider        TEXT,
  model           TEXT,
  output_type     TEXT CHECK (output_type IN ('story_bible','episode')),
  output_id       TEXT,
  created_by_sub  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  started_at      TEXT,
  completed_at    TEXT,
  UNIQUE (organization_id, idempotency_key)
);

-- One balance per organization (tenant billing account). `plan` is server-owned.
CREATE TABLE IF NOT EXISTS credit_accounts (
  organization_id    TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan               TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','paid')),
  balance            INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  initial_granted_at TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- A hold reserves credits for one job. It is settled after a validated save or
-- released (refunded) when the job fails without billable output.
CREATE TABLE IF NOT EXISTS credit_holds (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id          TEXT NOT NULL UNIQUE REFERENCES generation_jobs(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL CHECK (amount > 0),
  status          TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','settled','released')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  settled_at      TEXT
);

-- Append-only credit history. `amount` is signed for debits/credits; settle
-- rows are zero-value markers that confirm reserved usage.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('grant','reserve','settle','release')),
  amount          INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL CHECK (balance_after >= 0),
  idempotency_key TEXT NOT NULL,
  job_id          TEXT,
  reason          TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_story_bibles_project ON story_bibles (project_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes (project_id, episode_number, version DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_org_created ON generation_jobs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON generation_jobs (project_id);
CREATE INDEX IF NOT EXISTS idx_ledger_org_created ON credit_ledger (organization_id, created_at DESC);

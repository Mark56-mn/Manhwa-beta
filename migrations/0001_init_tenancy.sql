-- Manhwa Studio — initial tenancy schema (blueprint TASK 07)
-- D1 is SQLite. Every tenant-owned row reaches an organization through a
-- foreign key; queries must always be scoped by organization_id and
-- authorized against organization_memberships keyed by the OIDC `sub`.

CREATE TABLE organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL CHECK (length(name) > 0),
  slug       TEXT NOT NULL UNIQUE CHECK (length(slug) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Identity mapping keyed by the Sign in with Freebuff OIDC `sub`.
-- No emails are stored here; lookups are never done by email.
CREATE TABLE users (
  id           TEXT PRIMARY KEY,             -- OIDC sub
  display_name TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE organization_memberships (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_sub        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (organization_id, user_sub)
);

CREATE TABLE projects (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (length(title) > 0),
  genre           TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'in_production', 'approved', 'published')),
  created_by_sub  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE audit_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_sub       TEXT,
  action          TEXT NOT NULL CHECK (length(action) > 0),
  target_type     TEXT,
  target_id       TEXT,
  detail          TEXT,                        -- JSON string; never secrets
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_memberships_user        ON organization_memberships (user_sub);
CREATE INDEX idx_memberships_org         ON organization_memberships (organization_id);
CREATE INDEX idx_projects_org            ON projects (organization_id);
CREATE INDEX idx_audit_org_created       ON audit_events (organization_id, created_at);

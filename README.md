# Manhwa Studio (Manhwa Beta)

A creator workspace for manhwa/moon-comic projects: story bibles, episode scripts, character
continuity, analytics, and approval records. Local project drafts live in browser `localStorage`;
one real workflow — the **shared cloud-project list/create panel** — calls the **Cloudflare Worker API
(Hono)** through a single typed client.

> **Honest status:** AI generation, video rendering, and YouTube publishing are **not connected**.
> Cloud projects are implemented end-to-end in code and covered by tests, but **live sign-in is
> unverified**: no OIDC client or Supabase Auth project is configured in this environment, and the
> deployment answer is unconfirmed. The code in this branch has **not been deployed**; the only live
> Worker ever probed is the owner's Freebuff-hosted site (22 Oct 2026, see
> [`docs/audits/FREEBUFF_DATABASE_ACCESS_PROBE.md`](docs/audits/FREEBUFF_DATABASE_ACCESS_PROBE.md)).
> Every capability is classified by verification level in
> [`docs/audits/TASK-03-CAPABILITY-INVENTORY.md`](docs/audits/TASK-03-CAPABILITY-INVENTORY.md)
> (see its 22 October 2026 reconciliation section).
> The implementation source of truth is the consolidated blueprint (Phase 0–4 roadmap in
> [`tasks/ROADMAP-RECONCILIATION.md`](tasks/ROADMAP-RECONCILIATION.md)).

## Verified local workflow

These commands were run in this repository on 22 October 2026 with the exit codes shown.

| Step | Command | Exit |
|---|---|---|
| Install dependencies | `bun install --frozen-lockfile` | 0 |
| Typecheck | `bun run lint` (runs `tsc --noEmit`) | 0 |
| Tests | `bun run test` (bun test, 189 tests / 12 suites) | 0 |
| Production build | `bun run build` (Vite) | 0 |
| Dev server | `bun run dev` (serves `0.0.0.0:3000`) | 0 (HTTP 200 verified) |

**Requirements:** Bun **≥ 1.4** (the committed `bun.lock` uses `lockfileVersion: 2`; Bun 1.3.x fails to
parse it), Node 24 tested. Use the lockfile as-is — do not regenerate it with npm/yarn (there is no
`package-lock.json` and there should not be one).

```bash
bun install --frozen-lockfile   # reproducible install from bun.lock
bun run dev                     # http://localhost:3000
bun run lint                    # typecheck
bun run build                   # output in dist/
```

## Testing and CI

- **Tests:** `bun run test` runs 189 tests across twelve suites:
  - `tests/honesty.test.ts` — scans application source and fails if fake-success strings,
    non-literal/unapproved `localStorage` keys, missing honest labels, or network I/O outside the single
    typed API client ever reappear.
  - `tests/storage.test.ts` — the stored-project sanitizer (resets only fabricated publication fields,
    never mutates input, tolerates malformed stored data).
  - `tests/seed-data.test.ts` — demo seed data makes no publication claims and has a consistent shape.
  - `tests/tenancy.test.ts` — both real D1 migrations executed against SQLite: tenant isolation,
    sub-keyed membership checks, CHECK/foreign-key/unique enforcement, cascades, and replication schema
    constraints.
  - `tests/asset.test.ts` — the R2-backed asset routes: honest 503s when a binding or the auth client is
    missing, 401 when signed out, cross-organization 403s, org-scoped listing, upload round-trip,
    content-type allow-list, 10 MiB cap (413), deletion, and the exact-origin mutation guard.
  - `tests/projects.test.ts` — the shared projects API against real SQLite: 401/503/403 gates, Tenant A
    cannot read/modify/delete Tenant B's projects or assets, creation is scoped to the session tenant,
    browser-supplied identity headers are ignored, and the origin guard.
  - `tests/origins.test.ts` — exact-origin parsing, credentialed preflight, and the guarantee that a
    wildcard origin is never emitted.
  - `tests/api-client.test.ts` — the typed client: 401/403/503 mapping, network/timeout/cancellation,
    malformed responses, credentials, and no token in browser code.
  - `tests/auth-hardening.test.ts` — identity normalization and configuration validation; spoofed
    headers/cookies rejected; every protected route 401s when signed out; cross-tenant project and
    asset ID guessing denied; ownership fields rejected; the no-referrer CSRF path; CORS on 401 and
    preflight short-circuiting; truthful auth-route fallback; readiness reporting; and static guards
    against a header-derived identity, cookie handling, or token storage in the app.
  - `tests/cloud-workspace.test.ts` — every UI state (signed out, not configured, forbidden, empty, ready,
    transient error) and that a save is reported only after the server confirms it.
  - `tests/replication.test.ts` — outbox idempotency, retries with backoff, duplicate targets, and the
    last-success marker never advancing on failure.
  - `tests/supabase-backup.test.ts` — the PostgREST backup adapter against a fake fetch (no live backup).
- **No hosted CI.** GitHub Actions is deliberately not part of this project's validation workflow
  (the only workflow file, `ci.yml`, was removed in ROADMAP TASK 01; the account-level Actions billing
  lock meant jobs never started). Validation is performed by the coding agent and by the project's own
  local gates and deployment/runtime checks: the four commands above, run on the exact candidate commit.
  Treat a change as verified only when those commands were executed and their exit codes recorded —
  there is no CI badge or hosted run to point at.

## Deployment

- **API worker:** `wrangler.toml` + `worker/src/` define the Hono API (blueprint TASK 06 foundation).
  Verified locally with `bunx wrangler dev --port 8787` (`/healthz` → 200, `/readyz` reports real
  binding status). **No deployment has been performed** — see `docs/DEPLOYMENT.md` for the documented
  (unexecuted) deploy and rollback procedures.
- **Bindings:** `DB` (D1) and `FILES` (R2) are wired in `wrangler.toml` and exercised by
  `tests/tenancy.test.ts` / `tests/projects.test.ts` / `tests/asset.test.ts` against real SQLite and
  in-memory R2. Per `docs/DEPLOYMENT.md` the D1 database and R2 bucket were provisioned on the owner's
  account and a local `wrangler dev` readiness probe reported `d1: ok` / `r2: ok`; that live
  provisioning has **not** been independently re-verified from the repository.
- **Schema:** `migrations/0002_assets_and_replication.sql` is committed but **not applied to any live
  database**. It reconciles the `assets` table (which TASK 12 created outside migration history) and
  adds the replication outbox. Applying it needs the owner's authorization.
- **Frontend:** static build (`bun run build` → `dist/`); hosting not configured yet.

## Secrets and environment

- `.env.example` documents variable **names with placeholders only** — it is the only env file that may
  be committed.
- Real values belong in the platform secret manager or an untracked `.env.local` / `.dev.vars`
  (all gitignored, including `.dev.vars*`, `*.pem`, `*.key`).
- Never prefix a secret with `VITE_` (Vite would inline it into the browser bundle).
- Never paste secrets into chat, issues, logs, screenshots, or telemetry; verify them by presence only.

## Repository layout

```
src/                 React app (App shell, components, demo seed data, types)
worker/              Cloudflare Worker API (Hono): health/readiness, auth-ready routes
migrations/          D1 SQL migrations (applied to the real database in TASK 07)
tests/               bun test suites (honesty, storage, seed, tenancy, assets, projects, origins, auth, backup)
scripts/             Operator helpers (e.g. store-secrets.sh)
tasks/               Authoritative task definitions + roadmap reconciliation
docs/audits/         Implementation reports + capability inventory (per task)
docs/handoffs/       Handoff documents between tasks (read before starting any task)
docs/DEPLOYMENT.md   Deploy/rollback procedure (documented, not executed)
```

## Workflow rules (from the blueprint)

One task at a time on a `task/TASK-XX-...` branch; no direct commits to `main` without owner
authorization; every task ends with an implementation report and a handoff, then stops; no fake
functionality, fake telemetry, or false "connected" states.

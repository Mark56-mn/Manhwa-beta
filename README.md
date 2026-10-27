# Manhwa Studio (Manhwa Beta)

A creator workspace for manhwa/moon-comic projects: story bibles, episode scripts, character
continuity, analytics, and approval records. Local project drafts live in browser `localStorage`;
the **shared cloud workspace** — projects, project profiles, Story Bibles, episodes, generation jobs and
writing credits — calls the **Cloudflare Worker API (Hono)** through a single typed client.

> **Honest status (re-verified 27 October 2026):** cloud Story Bible and episode generation are
> implemented against a real server-side Gemini adapter, and the free plan's 100 writing credits are
> server-enforced. **No AI call has been made live in this environment** (`GEMINI_API_KEY`/`GEMINI_MODEL`
> are unset), and **live sign-in is unverified**: no OIDC client is configured for a deployment origin
> this repository controls. With no provider, generation returns a truthful `provider_not_configured`
> and nothing is charged. Image, voice, video rendering and YouTube publishing are **not connected**.
>
> **Backend reachability, corrected:** the owner's Freebuff-hosted site is **up** (`/healthz` 200,
> `/readyz` ready, `/api/v1/me` 401) but runs a **~40-commit stale** revision — it has no
> `/api/v1/projects`, emits no CORS headers and serves no frontend, so it cannot serve this app. The
> owner's own Cloudflare account already holds the real D1 (`manhwa-studio`, migration `0001` applied,
> all tables empty) and R2 bucket (`manhwa-studio-assets`) that `wrangler.toml` targets, but **no Worker
> has ever been deployed there**. `migrations/0002`/`0003` are **not applied to any live database**, and
> the untracked duplicate `migrations/0002_assets.sql` currently **blocks** that apply (move it first).
> A Vercel frontend is also live at <https://manhwa-beta.vercel.app>, built **without an API origin**,
> so it is disconnected by construction and says so. Recommended route, exact commands and verified
> evidence: [`docs/audits/TASK-08-BACKEND-RECOVERY-REPORT.md`](docs/audits/TASK-08-BACKEND-RECOVERY-REPORT.md).
> Related earlier probes: [`docs/audits/FREEBUFF_DATABASE_ACCESS_PROBE.md`](docs/audits/FREEBUFF_DATABASE_ACCESS_PROBE.md).
> Every capability is classified by verification level in
> [`docs/audits/TASK-03-CAPABILITY-INVENTORY.md`](docs/audits/TASK-03-CAPABILITY-INVENTORY.md)
> (see its 22 October 2026 reconciliation section).
> The implementation source of truth is the consolidated blueprint (Phase 0–4 roadmap in
> [`tasks/ROADMAP-RECONCILIATION.md`](tasks/ROADMAP-RECONCILIATION.md)).

## Verified local workflow

These commands were run in this repository on 22 October 2026 and re-run on 27 October 2026 with the
exit codes shown (the 27 Oct re-run is the current count).

| Step | Command | Exit |
|---|---|---|
| Install dependencies | `bun install --frozen-lockfile` | 0 |
| Typecheck | `bun run lint` (runs `tsc --noEmit`) | 0 |
| Tests | `bun run test` (bun test --isolate, **349 tests / 24 files**, 1185 assertions) | 0 |
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

- **Tests:** `bun run test` runs **349 tests across 24 files** (verified 27 October 2026):
  - `tests/task01-*.test.ts(x)` — the TASK-01 interaction, render and form suites, driven through a
    scoped DOM harness (`tests/setup/dom.ts`): editor field state and validation, project creation and
    deletion consistency, and empty/boundary inputs. The harness is registered per DOM test file rather
    than globally, because a global preload replaces `Request`/`Response`/`fetch` and breaks the Worker
    route tests.
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
  - `tests/provisioning.test.ts` — first-use organization provisioning (TASK 09): exactly one `owner`
    membership per verified subject, idempotent repeats, eight racing first sign-ins leaving no
    duplicate, a competitor's row reused instead of duplicated, an existing membership winning over a
    personal workspace, a malformed subject refused with no tenant created, and cross-tenant isolation
    through the real routes.
  - `tests/migration-safety.test.ts` — the tracked migration chain executed against a disposable SQLite
    database in the exact shape of production (0001 applied, `assets` already present): applies cleanly,
    re-runs safely, deletes nothing; plus the preflight checker's verdicts on a synthetic duplicate.
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
  - `tests/story-generation.test.ts` — the real story routes against SQLite: project profiles, versioned
    Story Bibles, episodes, durable jobs, exactly-once 100-credit issuance, concurrent reservations,
    idempotent replays, failed-job refunds, no negative balance, provider failures, free-plan media
    rejection, tenant isolation and forged ownership fields.
  - `tests/ai-provider.test.ts` — the Gemini adapter with an injected fetch: key in a header (never the
    URL), bounded output, auth/rate-limit/5xx/malformed/network/timeout mapping, and no key in errors.
  - `tests/story-workspace.test.ts` — frontend Story Studio states: no fabricated success without saved
    output, provider/credit/sign-in failures, key reuse only for uncertain requests, editing and approval.
- **Migration preflight:** `bun run migrations:check` (or `node scripts/check-migrations.mjs`) statically
  rejects a chain that cannot be applied — non-idempotent DDL, `DROP`/`ALTER`/`DELETE`, duplicate
  prefixes, empty files. It exits **1 today** because the untracked `migrations/0002_assets.sql` is a
  genuine blocker; that is the check working, not a broken build. Run it before any remote apply.
  - `tests/story-security.test.ts` — static guards that the provider key, model and host never reach
    browser code, are not logged or persisted, and that plan/balance/cost cannot come from a body.
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
  binding status), and **verified to bundle for workerd** on 27 Oct 2026 via
  `bunx wrangler deploy --dry-run` (192.20 KiB, gzip 44.12 KiB, bindings `env.DB` + `env.FILES`).
  **No Worker has ever been deployed to the owner's account** (its script list is empty and it has no
  `workers.dev` subdomain) — see `docs/DEPLOYMENT.md` for the verified deploy and rollback procedures.
- **Bindings:** `DB` (D1) and `FILES` (R2) are wired in `wrangler.toml` and exercised by
  `tests/tenancy.test.ts` / `tests/projects.test.ts` / `tests/asset.test.ts` against real SQLite and
  in-memory R2. Per `docs/DEPLOYMENT.md` the D1 database and R2 bucket were provisioned on the owner's
  account and a local `wrangler dev` readiness probe reported `d1: ok` / `r2: ok`; that live
  provisioning has **not** been independently re-verified from the repository.
- **Schema:** `migrations/0002_assets_and_replication.sql` and
  `migrations/0003_story_generation.sql` are committed but **not applied to any live database**.
  `0002` reconciles `assets` and adds the replication outbox; `0003` adds project profiles, versioned
  Story Bibles/episodes, generation jobs, and the credit account/hold/ledger tables. Both are additive
  (`IF NOT EXISTS`, no `DROP`/`ALTER`) and the live D1 holds **no rows**, so applying them risks no data;
  tests apply them to SQLite only. Applying them needs the owner's authorization. **Before applying,
  move the untracked duplicate `migrations/0002_assets.sql`** (`mv migrations/0002_assets.sql /tmp/`):
  it sorts first, tries to create `assets` which already exists, and aborts the whole run.
- **AI provider:** generation requires **both** `GEMINI_API_KEY` and an explicit `GEMINI_MODEL` as
  server-side Worker secrets. No model is invented and no paid fallback is used. The browser never
  calls the provider and never receives the key.
- **Frontend:** static build (`bun run build` → `dist/`). Vercel settings are configured and documented
  in [`docs/DEPLOYMENT-VERCEL.md`](docs/DEPLOYMENT-VERCEL.md) (`vercel.json`, `VITE_API_BASE_URL`, Worker
  `ALLOWED_ORIGINS`, `scripts/verify-deployment.mjs`). A Vercel deployment **does exist and is live** at
  <https://manhwa-beta.vercel.app> (verified 27 Oct 2026), but it was built with `VITE_API_BASE_URL`
  unset — its bundle contains no API origin at all — so it is a disconnected frontend that reports that
  fact instead of faking success. Its project settings, branch and commit **cannot be inspected from this
  repository** (no Vercel credentials); set `VITE_API_BASE_URL` to the API origin and redeploy to
  connect it.

## Secrets and environment

- `.env.example` documents variable **names with placeholders only** — it is the only env file that may
  be committed.
- Real values belong in the platform secret manager or an untracked `.env.local` / `.dev.vars`
  (all gitignored, including `.dev.vars*`, `*.pem`, `*.key`).
- Never prefix a secret with `VITE_` (Vite would inline it into the browser bundle).
- Never paste secrets into chat, issues, logs, screenshots, or telemetry; verify them by presence only.
- Server-only AI variables: `GEMINI_API_KEY` and `GEMINI_MODEL`. Either both are set or generation is
  honestly unavailable. Do not prefix them with `VITE_`.

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

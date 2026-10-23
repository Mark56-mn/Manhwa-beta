# Manhwa Studio (Manhwa Beta)

A creator workspace for manhwa/moon-comic projects: story bibles, episode scripts, character
continuity, analytics, and approval records. Local project drafts live in browser `localStorage`;
the **shared cloud workspace** — projects, project profiles, Story Bibles, episodes, generation jobs and
writing credits — calls the **Cloudflare Worker API (Hono)** through a single typed client.

> **Honest status:** cloud Story Bible and episode generation are implemented against a real
> server-side Gemini adapter, and the free plan's 100 writing credits are server-enforced. **No AI call
> has been made live in this environment** (`GEMINI_API_KEY`/`GEMINI_MODEL` are unset), and **live
> sign-in is unverified**: no OIDC client is configured here and the deployment answer is unconfirmed.
> With no provider, generation returns a truthful `provider_not_configured` and nothing is charged.
> Image, voice, video rendering and YouTube publishing are **not connected**. The code in this branch
> has **not been deployed** and `migrations/0003_story_generation.sql` has **not been applied** to any
> database; the only live Worker ever probed is the owner's Freebuff-hosted site (22 Oct 2026, see
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
| Tests | `bun run test` (bun test, 246 tests / 16 suites) | 0 |
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

- **Tests:** `bun run test` runs 246 tests across sixteen suites:
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
  - `tests/story-generation.test.ts` — the real story routes against SQLite: project profiles, versioned
    Story Bibles, episodes, durable jobs, exactly-once 100-credit issuance, concurrent reservations,
    idempotent replays, failed-job refunds, no negative balance, provider failures, free-plan media
    rejection, tenant isolation and forged ownership fields.
  - `tests/ai-provider.test.ts` — the Gemini adapter with an injected fetch: key in a header (never the
    URL), bounded output, auth/rate-limit/5xx/malformed/network/timeout mapping, and no key in errors.
  - `tests/story-workspace.test.ts` — frontend Story Studio states: no fabricated success without saved
    output, provider/credit/sign-in failures, key reuse only for uncertain requests, editing and approval.
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
  binding status). **No deployment has been performed** — see `docs/DEPLOYMENT.md` for the documented
  (unexecuted) deploy and rollback procedures.
- **Bindings:** `DB` (D1) and `FILES` (R2) are wired in `wrangler.toml` and exercised by
  `tests/tenancy.test.ts` / `tests/projects.test.ts` / `tests/asset.test.ts` against real SQLite and
  in-memory R2. Per `docs/DEPLOYMENT.md` the D1 database and R2 bucket were provisioned on the owner's
  account and a local `wrangler dev` readiness probe reported `d1: ok` / `r2: ok`; that live
  provisioning has **not** been independently re-verified from the repository.
- **Schema:** `migrations/0002_assets_and_replication.sql` and
  `migrations/0003_story_generation.sql` are committed but **not applied to any live database**.
  `0002` reconciles `assets` and adds the replication outbox; `0003` adds project profiles, versioned
  Story Bibles/episodes, generation jobs, and the credit account/hold/ledger tables. Applying either
  needs the owner's authorization; tests apply them to SQLite only.
- **AI provider:** generation requires **both** `GEMINI_API_KEY` and an explicit `GEMINI_MODEL` as
  server-side Worker secrets. No model is invented and no paid fallback is used. The browser never
  calls the provider and never receives the key.
- **Frontend:** static build (`bun run build` → `dist/`); hosting not configured yet.

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

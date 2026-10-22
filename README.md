# Manhwa Studio (Manhwa Beta)

A creator workspace for manhwa/moon-comic projects: story bibles, episode scripts, character
continuity, analytics, and approval records — currently a **frontend-only React app persisting to
browser `localStorage`**, plus a **Cloudflare Worker API (Hono) foundation that the UI does not call
yet**.

> **Honest status:** AI generation, cloud persistence from the UI, authentication, video rendering, and
> YouTube publishing are **not connected** in this build. The Worker, D1 schema and R2 asset routes
> exist and are covered by tests, but **no Worker has been deployed** and no sign-in client is
> registered. Every capability is classified by verification level in
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
| Tests | `bun run test` (bun test, 59 tests / 5 suites) | 0 |
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

- **Tests:** `bun run test` runs 59 tests across five suites:
  - `tests/honesty.test.ts` — scans application source and fails if fake-success strings, network calls,
    non-literal/unapproved `localStorage` keys, or missing honest labels ever reappear (automated version
    of the TASK 02/03 manual greps).
  - `tests/storage.test.ts` — the stored-project sanitizer (resets only fabricated publication fields,
    never mutates input, tolerates malformed stored data).
  - `tests/seed-data.test.ts` — demo seed data makes no publication claims and has a consistent shape.
  - `tests/tenancy.test.ts` — the real D1 migration executed against SQLite: tenant isolation, sub-keyed
    membership checks, CHECK/foreign-key/unique enforcement, and cascade deletes.
  - `tests/asset.test.ts` — the R2-backed asset routes: honest 503s when a binding or the auth client is
    missing, 401 when signed out, cross-organization 403s, org-scoped listing, upload round-trip,
    content-type allow-list, 10 MiB cap (413), deletion, and the same-origin mutation guard.
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
  `tests/tenancy.test.ts` / `tests/asset.test.ts` against local shims. Per `docs/DEPLOYMENT.md` the D1
  database and R2 bucket were provisioned on the owner's account and a local `wrangler dev` readiness
  probe reported `d1: ok` / `r2: ok`; that live provisioning has **not** been independently re-verified
  from the repository, and no route in the React app calls the API yet.
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
tests/               bun test suites (honesty, sanitizer, seed data, D1 tenancy, R2 assets)
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

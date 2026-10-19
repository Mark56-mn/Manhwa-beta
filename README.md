# Manhwa Studio (Manhwa Beta)

A creator workspace for manhwa/moon-comic projects: story bibles, episode scripts, character
continuity, analytics, and approval records — currently a **frontend-only application persisting to
browser `localStorage`**.

> **Honest status:** AI generation, cloud persistence, authentication, video rendering, and YouTube
> publishing are **not connected** in this build. Every capability is classified in
> [`docs/audits/TASK-03-CAPABILITY-INVENTORY.md`](docs/audits/TASK-03-CAPABILITY-INVENTORY.md).
> The implementation source of truth is the consolidated blueprint (Phase 0–4 roadmap in
> [`tasks/ROADMAP-RECONCILIATION.md`](tasks/ROADMAP-RECONCILIATION.md)).

## Verified local workflow

These commands were run in this repository on 19 October 2026 with the exit codes shown.

| Step | Command | Exit |
|---|---|---|
| Install dependencies | `bun install --frozen-lockfile` | 0 |
| Typecheck | `bun run lint` (runs `tsc --noEmit`) | 0 |
| Tests | `bun run test` (bun test, 34 tests) | 0 |
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

- **Tests:** `bun run test` runs 34 tests across three suites:
  - `tests/honesty.test.ts` — scans application source and fails if fake-success strings, network calls,
    non-literal/unapproved `localStorage` keys, or missing honest labels ever reappear (automated version
    of the TASK 02/03 manual greps).
  - `tests/storage.test.ts` — the stored-project sanitizer (resets only fabricated publication fields,
    never mutates input, tolerates malformed stored data).
  - `tests/seed-data.test.ts` — demo seed data makes no publication claims and has a consistent shape.
- **CI:** `.github/workflows/ci.yml` runs install → lint → test → build on pushes and pull requests.
  **Configured but not yet executed** — it runs on GitHub once the changes are pushed; do not report CI
  as passing until a real run has been observed.

## Deployment

- **API worker:** `wrangler.toml` + `worker/src/` define the Hono API (blueprint TASK 06 foundation).
  Verified locally with `bunx wrangler dev --port 8787` (`/healthz` → 200, `/readyz` reports real
  binding status). **No deployment has been performed** — see `docs/DEPLOYMENT.md` for the documented
  (unexecuted) deploy and rollback procedures.
- **Frontend:** static build (`bun run build` → `dist/`); hosting not configured yet.
- D1/R2 bindings attach in later tasks (07/12) once their resources exist and are verified.

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
worker/              Cloudflare Worker API (Hono): health/readiness endpoints
tests/               bun test suites (honesty guards, sanitizer, seed data)
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

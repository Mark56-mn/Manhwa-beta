# IMPLEMENT SHARED FOUNDATION — Implementation Report

**Task:** [`tasks/TASK-IMPLEMENT-SHARED-FOUNDATION.md`](../../tasks/TASK-IMPLEMENT-SHARED-FOUNDATION.md)
**Date:** 23 October 2026
**Scope:** code, one additive migration (unapplied), tests, docs. **Nothing deployed, nothing merged, no live database touched.**

## 1. Branch and base commit

- Branch: **`task/TASK-IMPLEMENT-SHARED-FOUNDATION`**
- Base: **`905bf57e72791f37039050d9f2872193bdb4cae7`** — the verified tip of
  `task/TASK-01-reconcile-ci` (also `refs/heads/task/TASK-01-reconcile-ci` on origin).
- `origin/main` at start and end: `49ed52c9f960b8e50ab61a21a6f2bfc7128fa5a2` (28 commits behind the base;
  this task does not merge or rebase it).

## 2. Exact commits

- Implementation commit: **`fe80671a9c3addac37d92d17683ed92b18d35987`**
- Report + handoff: one commit above it (the branch tip is `git rev-parse HEAD`; it differs only by
  Markdown).

## 3. Files changed and what each does

**Worker (server)**

| File | Change |
|---|---|
| `worker/src/identity.ts` *(new)* | The single identity path. `resolveFreebuffUser()` verifies the real session via `@freebuff/auth`, validates `sub`, and returns null for missing/invalid/expired credentials. No header/query/body identity is ever trusted. |
| `worker/src/tenancy.ts` *(new)* | `firstOrganizationForUser()` (from the verified `sub`) and `isOrganizationMember()`. |
| `worker/src/origins.ts` *(new)* | Exact-origin allow-list (`APP_ORIGIN` + `ALLOWED_ORIGINS`), strict normalization, credentialed CORS headers, preflight headers, and `isAllowedMutationOrigin()` (Origin required for mutations — no “missing header means allow” branch). Wildcards are impossible. |
| `worker/src/projects.ts` *(new)* | GET list / GET one / POST / PATCH / DELETE projects, all scoped by the session tenant. 503 `auth_not_configured` / `not_configured`, 403 origin or non-member, 401 no session, 404 cross-tenant. Validation for title/genre/status; `private, no-store` on every response. Injectable `resolveUser` for tests. |
| `worker/src/assets.ts` | Converted to `createAssetApp()` with an injected resolver; the old `AUTH_USER_OVERRIDE` environment backdoor is **removed from worker code**. Uses the shared tenancy helper and the exact-origin mutation guard (previously a permissive inline check that allowed a missing Origin). |
| `worker/src/env.ts` | Removed `AUTH_USER_OVERRIDE`; added `ALLOWED_ORIGINS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only). |
| `worker/src/index.ts` | CORS/preflight middleware on the exact allow-list; mounts the projects router; exports the root app for tests; route banner updated. |
| `worker/src/replication.ts` *(new)* | Outbox enqueue with stable idempotency keys, bounded batch runner, exponential backoff, duplicate-target handling, per-row attempts/last_error, and a `last_success_at` marker that a failed run cannot advance. |
| `worker/src/supabaseBackup.ts` *(new)* | Supabase PostgREST secondary target (`/rest/v1/backup_<table>?on_conflict=id`, merge-duplicates), 409 → duplicate, timeout, and no key in messages. `supabaseTargetFromEnv()` returns null when unconfigured. |

**Frontend**

| File | Change |
|---|---|
| `src/lib/api.ts` *(new)* | The only module that calls `fetch`. Typed `getSession`, `listProjects`, `createProject`; configurable `VITE_API_BASE_URL` (public, empty = same origin); `credentials: 'include'`; per-request timeout and caller cancellation; typed `ApiError` kinds (`unauthorized`, `forbidden`, `not_found`, `bad_request`, `conflict`, `not_configured`, `server`, `network`, `timeout`, `aborted`, `invalid_response`); malformed responses rejected rather than guessed. |
| `src/lib/cloudWorkspace.ts` *(new)* | Pure state machine: loading/signed_out/not_configured/forbidden/error/ready; `saveCloudProject()` returns a success notice **only** after the server confirms, and a “nothing was saved” failure otherwise. |
| `src/components/CloudWorkspacePanel.tsx` *(new)* | The one real workflow in the UI: session check, server project list (empty state included), create form with saving/saved/error states, retry for transient errors. Rendered inside `ProjectHub`, explicitly separate from browser-local projects. |
| `src/components/ProjectHub.tsx` | Mounts the panel and clarifies that the grid below is browser-local while the panel is server-backed. |
| `vite.config.ts` | Dev-only `/api` proxy to `127.0.0.1:8787` so local development mirrors the same-origin production layout. No build/deploy effect. |

**Database / config / docs**

| File | Change |
|---|---|
| `migrations/0002_assets_and_replication.sql` *(new)* | Creates the `assets` table the code has required since TASK 12 (never in migration history) plus `replication_outbox` / `replication_state`. All statements `IF NOT EXISTS`; no data statements; **not applied anywhere**. |
| `.env.example` | Documents `VITE_API_BASE_URL`, `ALLOWED_ORIGINS`, `SUPABASE_SERVICE_ROLE_KEY` (names/placeholders only). |
| `README.md`, `tests/*`, this report, handoff, task file | Status, counts, coverage, and evidence. |

No dependency was added or upgraded. `package.json` and `bun.lock` are unchanged.

## 4. Which real workflows now work

- **Cloud projects (code + tests):** the panel loads the session, lists the caller's server projects,
  and creates a project that the server stores in D1 under the session tenant. The UI shows a save only
  after the HTTP 201, and shows an honest error otherwise.
- **Cross-tenant protection:** requests for another tenant's project or asset return 404/403 and change
  nothing; creation ignores `organization_id`/`created_by_sub` supplied by the browser.
- **CORS for a second host:** exact allow-listed origins get credentialed CORS and 204 preflights;
  unlisted origins get 403 and no CORS headers.
- **Backup mechanics:** outbox replay is idempotent, retries transient failures with backoff, records
  `last_success_at` only after the secondary confirms, and preserves the previous marker on failure.

**Not live-verified:** a browser sign-in, a live session cookie, a deployed API call, and any Supabase
write. No identity client, deployment, or Supabase project exists in this environment.

## 5. Commands run and exact results

Environment: Bun **1.4.4**, existing `node_modules`, no lockfile change. Each gate run on the final tree;
`pipefail` with `PIPESTATUS` capture.

```text
bun install --frozen-lockfile   # exit 0 (no packages changed; lockfile untouched)
bun run lint                    # exit 0 — tsc --noEmit, no diagnostics
bun run test                    # exit 0 — 145 pass, 0 fail, 334 expect(), 11 files
bun run build                   # exit 0 — dist/ emitted (678 kB JS); chunk-size advisory only
git diff --check                # exit 0 — no whitespace errors
```

Note: the baseline before this task was 59 tests / 5 files; all 59 originals still pass, with the
`honesty` network rule narrowed (see §6) and the `asset` tests moved to injected identity.

**Additional live-HTTP check (not a browser test).** A throwaway Bun server (deleted after use) served
`createProjectsApp` on `127.0.0.1:8790` against the two migrations in real SQLite, with identity injected
for the check only. Observed over actual HTTP: `GET /api/v1/projects` → `200 {"projects":[]}`;
`POST` with `Origin: http://localhost:3001` → `201` with the stored project; `POST` with no Origin →
`403`; `POST` with `Origin: https://evil.example` → `403`; the follow-up `GET` returned the created row.
This proves the route + schema + serialization path over a real socket; it does **not** prove OIDC
verification, cookie delivery, or a deployed Worker.

## 6. Tests added / updated

Added (86 tests):

- `tests/projects.test.ts` (19) — 401, 503 auth/D1, 403 no-org, identity headers ignored, A/B list
  isolation, cross-tenant read/modify/delete of projects and read/delete of assets, creation scoped to
  the session tenant, missing/foreign/allowed-second-host Origin, validation, `private, no-store`.
- `tests/origins.test.ts` (10) — normalization, exact matching, no wildcard, preflight 204/403,
  credentialed headers, `Vary: Origin`.
- `tests/api-client.test.ts` (17) — success shapes, credentials/no token, status→kind mapping,
  retryability, network, timeout, pre-request/post-request abort, malformed JSON/records.
- `tests/cloud-workspace.test.ts` (16) — every state transition and save-success-only-after-confirmation.
- `tests/replication.test.ts` (10) — stable keys, duplicate enqueue, retries/backoff, exhausted failure,
  duplicate target, batch limit, delete operations, last-success preservation.
- `tests/supabase-backup.test.ts` (8) — config refusal, URL/headers/body, 204, 409, 401 without key
  leakage, network error, timeout.
- `tests/helpers/d1.ts`, `tests/helpers/r2.ts` — real-SQLite D1 and in-memory R2 doubles.

Updated honestly, not weakened:

- `tests/honesty.test.ts` — the old “application source performs no network calls” rule became
  impossible once the app really calls the API. It is now narrower and stronger: **only**
  `src/lib/api.ts` may call `fetch`; other network primitives are still forbidden; the API base URL must
  come from `VITE_API_BASE_URL`; no `freebuff.page` / `vercel.app` / `workers.dev` literal may appear.
- `tests/tenancy.test.ts` — runs both migrations and asserts the new tables/indexes plus asset cascades,
  outbox uniqueness and CHECK constraints.
- `tests/asset.test.ts` — same assertions, identity injected through `createAssetApp` instead of the
  deleted environment backdoor.

## 7. Credentials/configuration still missing (names only)

- `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN` — owner must register the OIDC client and the
  callback for each host. Until then `/api/v1/me` and the panel answer `auth_not_configured` (503).
- `ALLOWED_ORIGINS` — must contain the second frontend origin when it is not `APP_ORIGIN`.
- `VITE_API_BASE_URL` — build-time public origin for a separately hosted frontend.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — only for the secondary backup; absent = no backup.
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` — absent in this workspace; not needed and not used.

No secret value was read, written, printed, or committed.

## 8. Production checks that remain unverified

- Real sign-in → session cookie → `GET /api/v1/me` 200 → `GET /api/v1/projects` with a real user.
- Live 401 for expired/malformed credentials against the real OIDC issuer (the resolver is covered only
  with doubles; the SDK path is unchanged from TASK 07).
- Two-tenant isolation against the live database (proven against the real schema in SQLite, not live D1).
- Cross-host cookie behavior (the feasibility report already proves a host-only `__Host-` cookie cannot
  cross unrelated domains).
- The live Freebuff D1 schema (see §9) and the owner's standalone D1.
- Any Supabase write, and the replication scheduler (not wired).
- R2 upload/download of assets from the panel (not part of this slice; routes unchanged).

## 9. Known security or deployment blockers

1. **Migration history drift (found and reconciled, not applied).** `worker/src/assets.ts` has queried an
   `assets` table since TASK 12, but no migration created it. `0002` adds it idempotently; applying it to
   any live database requires owner authorization.
2. **Live schema/data could not be inspected read-only.** There is no supported external interface to
   Freebuff's D1 (probe report §2) and no `CLOUDFLARE_API_TOKEN` for the owner's D1. The probe did prove
   the Freebuff D1 answers `SELECT 1` and holds ~180 KB of data, but not its tables. **No migration,
   reset, or write was performed.**
3. **Cross-site cookies still block dual-host.** The SDK issues a host-only `__Host-freebuff_session`
   (`SameSite=Lax`). `vercel.app → freebuff.page` browser calls will be unauthenticated, so the API will
   correctly answer 401. Use same-site custom domains or a per-host same-origin proxy. `ALLOWED_ORIGINS`
   makes the CORS side correct; it cannot make the cookie cross sites.
4. **Only one identity implementation exists: Freebuff OIDC.** Supabase Auth is not implemented because
   no project/config exists. Migration path is documented in the handoff, and no mixed-session adapter
   was invented.
5. **Replication is not scheduled and not wired.** The outbox is empty in production because nothing
   enqueues yet, and migration 0002 is unapplied. Media (R2 objects) is deliberately excluded from the
   relational backup; it needs a separate job.
6. **The Freebuff site's `/auth/freebuff/login` 503** (`auth_not_configured` for an unknown SDK route)
   remains from the prior probe; it is not fixed here and should be handled before shipping sign-in UI.
7. **No down-migration** for 0002 (consistent with 0001), so rollback means a reviewed forward fix.
8. **Local gates are not production verification.** No Worker in this branch has been deployed.

## 10. Exact next task

**Owner decision + roadmap TASK 03 (real-session authentication and live two-tenant proof), then wire
the backup.**

1. Owner registers the Freebuff OIDC client for the deployed host(s) and sets `FREEBUFF_CLIENT_ID`,
   `FREEBUFF_ISSUER`, `APP_ORIGIN`, `ALLOWED_ORIGINS`; authorize a preview deploy.
2. Verify with real credentials: signed-out 401, sign-in, `/api/v1/me` 200, project create/list for two
   separate accounts, and that Tenant A gets 404/403 for Tenant B's rows; then record the result.
3. Only after that: apply `0002` (owner-authorized), then wire outbox enqueue + a scheduled replication
   run and verify a real Supabase write and `last_success_at`.
4. Then the dual-host frontend task, using same-site custom domains or a per-host proxy — never a
   cross-site cookie assumption.

Do not merge, deploy, register callbacks, apply migrations, or migrate data without the owner's explicit
instruction.

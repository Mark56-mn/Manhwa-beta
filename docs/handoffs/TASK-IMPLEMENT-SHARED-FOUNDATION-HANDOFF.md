# TASK IMPLEMENT SHARED FOUNDATION — Handoff

**From:** implementation agent · **To:** next agent / repository owner
**Date:** 23 October 2026
**Branch:** `task/TASK-IMPLEMENT-SHARED-FOUNDATION`
**Base:** `905bf57e72791f37039050d9f2872193bdb4cae7` (`task/TASK-01-reconcile-ci` tip)
**Report:** [`docs/audits/IMPLEMENT-SHARED-FOUNDATION-REPORT.md`](../audits/IMPLEMENT-SHARED-FOUNDATION-REPORT.md)
**Task:** [`tasks/TASK-IMPLEMENT-SHARED-FOUNDATION.md`](../../tasks/TASK-IMPLEMENT-SHARED-FOUNDATION.md)

> **Nothing was merged, deployed, migrated, or registered.** `origin/main` is untouched at `49ed52c`.
> Do not deploy, apply `0002`, or sign in a real account without the owner's explicit instruction.

## 1. Where the task stands

Implemented and locally verified:

- one typed frontend client (`src/lib/api.ts`) and one real UI workflow (cloud project list/create);
- a tenant-scoped projects API (`worker/src/projects.ts`) on the existing Hono Worker;
- a single server-side identity path (`worker/src/identity.ts`) with the old test-only
  `AUTH_USER_OVERRIDE` backdoor removed from worker code;
- exact-origin CORS/preflight plus a strict mutation-origin guard (`worker/src/origins.ts`);
- replication mechanics (`worker/src/replication.ts`) and a Supabase PostgREST adapter
  (`worker/src/supabaseBackup.ts`) — deliberately not scheduled;
- an additive, **unapplied** migration `migrations/0002_assets_and_replication.sql` that fixes real
  schema drift (`assets` table missing from migration history).

Not verified, because the environment has no identity client, deployment, or Supabase project:

- real browser sign-in / session cookie / `/api/v1/me` 200;
- live two-tenant isolation against D1 (proven against the real schema in SQLite instead);
- cross-host requests with cookies;
- any Supabase write or the replication job.

## 2. Current architecture (implemented state)

```text
Browser (same origin in the Freebuff build)
  └─ src/components/CloudWorkspacePanel.tsx
       └─ src/lib/cloudWorkspace.ts (state machine, no data fabrication)
            └─ src/lib/api.ts  ── cookies, timeout, typed errors ──▶  /api/v1/*
                                                                        │
Cloudflare Worker (worker/src/index.ts, Hono)                           │
  ├─ CORS middleware (exact origins only)                               │
  ├─ /api/v1/projects  → projects.ts                                    │
  ├─ /api/v1/assets/*  → assets.ts                                      │
  ├─ /api/v1/me        → session                                        │
  └─ auth wrap (@freebuff/auth) → identity.ts → D1 session verification ┘
                                                                        │
D1 (primary): organizations, users (keyed by OIDC sub), memberships, projects, assets, audit_events
R2 (media):   assets bodies, org-scoped, server-generated keys
Postgres (secondary, NOT live): replication_outbox → Supabase via PostgREST; never read by the app
```

Two frontends, one backend remains the target. The Worker is the only writer; Vercel must call it, never
touch D1 directly.

## 3. Security decisions (do not undo)

1. **Identity is only the verified session.** `resolveFreebuffUser()` calls the SDK and validates `sub`.
   No `X-User-Id`, query param, or body field is ever used for authorization. A missing auth config is a
   503, never an anonymous allowance.
2. **Tenant scope comes from the session**, via `firstOrganizationForUser()`. Every projects query is
   `WHERE organization_id = ?`; cross-tenant ids answer 404 and change nothing (assets keep their
   existing 403 policy).
3. **Mutations require an allow-listed `Origin`.** `isAllowedMutationOrigin()` has no “missing header =
   allow” branch. Tests cover missing, foreign, and second-host origins.
4. **CORS is exact and credentialed.** `APP_ORIGIN` + comma-separated `ALLOWED_ORIGINS`; wildcards and
   paths are rejected during normalization; `Access-Control-Allow-Origin: *` is never emitted;
   `Vary: Origin` is set. Unlisted preflights get 403.
5. **No browser-held tokens.** `credentials: 'include'`, no `Authorization` header, no localStorage
   token, no secret in `VITE_*`.
6. **No fabricated state.** The client rejects malformed JSON/records; the panel only shows a project or
   “Saved…” after a confirmed response; failures say “nothing was saved”.
7. **Tests use dependency injection**, not an environment flag. `createProjectsApp({ resolveUser })` and
   `createAssetApp({ resolveUser })` are the seams.

## 4. Important files

| Path | Why it matters |
|---|---|
| `worker/src/identity.ts` | The only place a user is derived from a request. Supabase-Auth migration plugs in here. |
| `worker/src/projects.ts` | The reference implementation for any new tenant-scoped resource. |
| `worker/src/origins.ts` | Origin allow-list; change CORS policy only here. |
| `worker/src/tenancy.ts` | Membership helpers; do not add ad-hoc org lookups. |
| `worker/src/replication.ts` | Outbox runner, idempotency key `table:id:updated_at`, last-success semantics. |
| `worker/src/supabaseBackup.ts` | Secondary writer; keep the service-role key server-side and never log it. |
| `migrations/0001_init_tenancy.sql` | Existing tenancy schema (already live in at least one D1). |
| `migrations/0002_assets_and_replication.sql` | **Not applied.** Creates `assets` + outbox/state. |
| `src/lib/api.ts` | The only module allowed to call `fetch` (enforced by `tests/honesty.test.ts`). |
| `src/lib/cloudWorkspace.ts` | UI state machine; extend this pattern for more workflows. |
| `src/components/CloudWorkspacePanel.tsx` | The working slice inside `ProjectHub`. |
| `tests/helpers/d1.ts`, `tests/helpers/r2.ts` | Real-SQLite D1 + in-memory R2 doubles for route tests. |
| `vite.config.ts` | Dev-only `/api` proxy to `127.0.0.1:8787`. |

## 5. Test and gate results (final tree)

```text
bun install --frozen-lockfile   # 0
bun run lint                    # 0 (tsc --noEmit)
bun run test                    # 0 — 145 pass, 0 fail, 334 expect(), 11 files
bun run build                   # 0 (dist/, chunk-size advisory only)
git diff --check                # 0
```

Baseline was 59 tests / 5 files; all original assertions still pass. `honesty.test.ts` was deliberately
narrowed: the app now really calls the API, so the rule is “only `src/lib/api.ts` may call `fetch`” plus
“no hardcoded deployment origin”, which is stricter where it matters.

To re-run a single suite: `bun test tests/projects.test.ts`.

## 6. Unfinished work, in order

1. **Owner actions (blocking live verification)**
   - Register the Freebuff OIDC client for the deployed host(s) and set `FREEBUFF_CLIENT_ID`,
     `FREEBUFF_ISSUER`, `APP_ORIGIN`; add the second host to `ALLOWED_ORIGINS`.
   - Authorize a preview deployment and a real sign-in test. Verify signed-out 401, sign-in,
     `/api/v1/me` 200, create/list as two separate accounts, and cross-tenant 404/403; record it.
2. **Roadmap TASK 03 (real-session auth + two-tenant proof live).** Do not claim it from these tests.
3. **Apply `0002` after authorization**, then:
   - enqueue outbox rows on project/asset create/update/delete (same transaction semantics: write primary
     first, outbox second; a failed outbox insert must not fake backup success);
   - add a scheduled Worker trigger for `runReplicationBatch` and a status surface that exposes
     `last_success_at` / `pending_count` (never tokens or payloads);
   - plan the separate R2 media backup (not covered by the relational outbox).
4. **Supabase Auth migration path (when the owner provides a project):** add a verifier implementing
   `UserResolver` that validates Supabase JWTs server-side (JWKS, issuer, audience, expiry), map the
   Supabase subject to the existing `users.id`, and never run both session systems in one request. Re-auth
   users before removing the Freebuff session. Do not add a permissive fallback.
5. **Dual-host frontend:** same-site custom domains (`app.` / `api.`) or a per-host same-origin proxy.
   A host-only `__Host-` cookie cannot cross `vercel.app` ↔ `freebuff.page`; confirm in the feasibility
   report before building.
6. **Sign-in UX:** the Freebuff deployment's `/auth/freebuff/login` currently returns a misleading
   `auth_not_configured` 503 (probe finding). Resolve it before exposing a sign-in button.

## 7. Owner decisions that must not be assumed

- Which backend shape is authoritative (report assumes the Freebuff Worker + its D1, per the task).
- Whether to apply `0002` and to which database (Freebuff-managed and the owner's own D1 are distinct).
- Who registers the second host's OIDC callback, and its exact origin.
- Whether Supabase Auth replaces Freebuff OIDC or runs only on the backup side first.

## 8. Commands for the next agent

```bash
git switch task/TASK-IMPLEMENT-SHARED-FOUNDATION
git log --oneline -3
bun install --frozen-lockfile
bun run lint
bun run test
bun run build
git diff --check

# Local API + UI (no auth client configured, so the panel shows the honest
# "identity provider not configured" state):
bunx wrangler dev --port 8787        # API
bun run dev                          # Vite on :3000, proxies /api to :8787
```

Never run `npx convex`/`convex dev` here (unrelated), never enable GitHub Actions, never commit a
credential, and never apply a migration or deploy without an explicit owner instruction.

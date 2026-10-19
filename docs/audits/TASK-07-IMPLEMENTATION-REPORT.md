# TASK 07 — Implementation Report

**Product:** Manhwa Studio · **Repository:** `Mark56-mn/Manhwa-beta`
**Task:** TASK 07 — Authentication, tenant isolation, and D1 data foundation (blueprint Phase 1)
**Branch:** `task/TASK-07-d1-tenancy-foundation` (base `6604457` = TASK-06 head; **seven stacked unmerged branches**; nothing pushed; `main` untouched)
**Date:** 19 October 2026

**Overall status: PARTIAL** — D1, tenancy schema, migrations (local **and** remote), and isolation tests are **complete and verified**. **Auth is blocked** on the owner registering a Sign in with Freebuff client (their login required — §3). The contract was validated, not invented.

---

## 1. Scope completed

- [x] Token re-audit after the owner's permission grant (finding: **R2 still denied**, §2).
- [x] Freebuff OIDC contract validated: `@freebuff/auth@0.1.0` installed, SDK `AGENTS.md` read and followed, API verified (`createFreebuffAuth` / `wrap` / `getUser` / `isSameOriginRequest`).
- [x] **D1 database created on the owner's account** and bound to the worker.
- [x] Initial migrations: `organizations`, `users`, `organization_memberships`, `projects`, `audit_events` + indexes — applied **locally and remotely**; remote schema verified live.
- [x] `/readyz` now **hard-gates D1** (503 until a real `SELECT 1` succeeds).
- [x] Auth wired per contract with an honest `auth_not_configured` state; protected-route pattern implemented (`/api/v1/me`).
- [x] Tenant-isolation tests (12) executing the **real migration SQL**; full gate chain green.

## 2. Credential re-audit (owner granted more access)

| Probe | Before grant | After grant |
|---|---|---|
| R2 buckets list | DENIED 10042 | **STILL DENIED 10042** |
| D1 list | allowed | allowed |
| Workers scripts | allowed | allowed |

**Owner action needed:** the R2 permission did not take effect — in the Cloudflare dashboard (My Profile → API Tokens → edit), add the **Workers R2 Storage** permission group (Edit), ensure the token policy is **saved**, and I will re-verify. R2 is not needed until TASK 12.

## 3. Authentication — validated contract, blocked on owner registration

- The documented contract exists and was implemented as specified: `@freebuff/auth` installed; `worker/src/auth.ts` creates **one cached auth instance per isolate**; `worker/src/index.ts` wraps the app **only when configured**; `/api/v1/me` shows the mandatory pattern (server-side `getUser`, 401 when signed out, `Cache-Control: private, no-store`); future mutations must use `isSameOriginRequest` and key rows by `user.sub`.
- **Blocker:** client IDs must be registered **with the owner's Freebuff login** — an agent must never mint or handle that login (SDK AGENTS.md §1/§5). Until `FREEBUFF_CLIENT_ID` / `FREEBUFF_ISSUER` / `APP_ORIGIN` are configured, `/auth/freebuff/*` and protected APIs answer **503 `auth_not_configured`** (verified below). No OAuth flow was hand-rolled; no fake user exists.
- **Two unblock paths (owner's choice):** (a) run `npx @freebuff/auth register --project manhwa-studio --name "Manhwa Studio" --environment development --redirect-uri http://localhost:8788/auth/freebuff/callback` with their Freebuff CLI login and give me the printed public values, or (b) authorize a Freebuff Sites project so `sites_enable_auth` provisions clients and injects the variables on deploy.

## 4. D1 database and schema (live on the owner's account)

- `bunx wrangler d1 create manhwa-studio` → **created**, region **WNAM**, id `d9557398-b439-463a-b5aa-a3703d5c3fdb` (wired into `wrangler.toml` with `account_id`).
- `migrations/0001_init_tenancy.sql` executed **10 commands** — `--local` exit 0 and `--remote` exit 0.
- **Remote verification (live query):** tables `audit_events, d1_migrations, organization_memberships, organizations, projects, users` served from WNAM.
- Design: identity keyed by OIDC `sub` (**no emails stored**); every tenant-owned row cascades from `organizations`; membership `UNIQUE(org, sub)`; role/status CHECK constraints; indexes for sub-lookups, org scoping, and audit time-series.

## 5. Worker verification in local workerd (evidence)

| Probe | Response |
|---|---|
| `/healthz` | **200** `{"status":"ok"}` |
| `/readyz` | **200** `{"status":"ready","checks":{"d1":{"status":"ok","detail":"D1 binding answered SELECT 1."},"r2":{"status":"not_configured",...},"auth":{"status":"not_configured",...}}}` |
| `/api/v1/me` | **503** `{"error":"auth_not_configured",...}` |
| `/auth/freebuff/signin` | **503** `auth_not_configured` with owner instructions |

Local wrangler process stopped; port confirmed closed.

## 6. Tests

New `tests/tenancy.test.ts` (**12 tests**) runs the real migration file against SQLite (D1 is SQLite-compatible) and asserts: expected tables/indexes; org-scoped queries never cross tenants; **sub-keyed membership joins** return only the caller's tenant rows; non-members get no role (the authorization primitive); no email column exists; role/status/empty-title/foreign-key/duplicate-membership constraints all reject; tenant deletion cascades. Suite totals: **46 tests, 0 failures**.

## 7. Commands and actual exit status

| Command | Exit | Result |
|---|---|---|
| `bun add @freebuff/auth` | 0 | `@freebuff/auth@0.1.0` (contract package) |
| `wrangler d1 create manhwa-studio` | 0 | database created (WNAM) |
| `wrangler d1 migrations apply --local` | **0** | 10 commands |
| `wrangler d1 migrations apply --remote` | **0** | 10 commands on the real database |
| remote `sqlite_master` query | success | tables verified (§4) |
| `bun run lint` (after 3 iteration fixes) | **0** | no diagnostics |
| `bun run test` | **0** | 46 pass / 0 fail |
| `bun run build` | **0** | frontend unaffected |
| `bun install --frozen-lockfile` | **0** | lockfile consistent |
| `wrangler dev` probes | — | §5 evidence |
| OAuth login flow / tenant API writes | **NOT RUN** | auth client not registered (§3); API data routes are TASK 08 |

## 8. Failures found and fixed (cause-level, no suppression)

1. Test expected D1's internal `d1_migrations` table in a plain-SQLite run — corrected the expectation (the real remote DB has it; verified live).
2. `bun:sqlite` typing: introduced one documented `rows<T>()` assertion helper instead of scattering casts.
3. Worker handler typing around `wrap()` — made inner handlers consistently async.

## 9. Security checks

- Tenant isolation is enforced by schema (FKs/cascades) and tested at the query-primitive level; API routes that will read data must use the tested sub-keyed patterns.
- No secret values printed/committed; the API token only ever appears in `Authorization` headers built from shell variables.
- Supabase remains **intentionally unused** (single-role decision: none for now — D1 is the authority; pooler reachability was verified in TASK 06).

## 10. Migrations / rollback

Migration applied remotely is create-only. Rollback: no down-migrations exist yet — **required by policy before any future destructive migration**; the database currently holds no data.

## 11. Status

**PARTIAL (strongly):** everything in TASK 07's scope except live sign-in is done and verified; auth completion is blocked on an owner-only action (§3) with exact unblock steps documented.

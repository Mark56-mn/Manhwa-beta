# TASK 07 — Handoff Document & Next Steps

**From:** TASK 07 D1/tenancy agent
**To:** Next Manhwa Studio engineering agent
**Date:** 19 October 2026

---

## 1. Current repository / branch / commit

- **Branch:** `task/TASK-07-d1-tenancy-foundation` (local, **not pushed**), based on TASK-06 head (`6604457`) → TASK-05 → 04 → 03 → 02 → PR #1 (`d460ad1`). **Seven stacked unmerged branches.**
- Report: `docs/audits/TASK-07-IMPLEMENTATION-REPORT.md`; deploy state: `docs/DEPLOYMENT.md`.

## 2. What is done (verified)

- **D1 database `manhwa-studio` live on the owner's account** (WNAM, id `d9557398-b439-463a-b5aa-a3703d5c3fdb`), bound in `wrangler.toml`; `migrations/0001_init_tenancy.sql` applied **locally and remotely** (remote tables verified by live query).
- **Schema:** `organizations`, `users` (OIDC-sub-keyed, no emails), `organization_memberships`, `projects`, `audit_events`, 4 indexes, cascading deletes, CHECK/UNIQUE/FK constraints.
- **Worker:** `/readyz` hard-gates D1 (200 `ready` with real `SELECT 1` locally; 503 until then); `/api/v1/me` and `/auth/freebuff/*` answer honest **503 `auth_not_configured`**; the Sign in with Freebuff SDK (`@freebuff/auth@0.1.0`) is mounted per its AGENTS.md whenever `FREEBUFF_CLIENT_ID`/`FREEBUFF_ISSUER`/`APP_ORIGIN` are configured.
- **Tests:** `tests/tenancy.test.ts` (12) runs the real migration SQL and proves the isolation primitives. Gates: frozen install 0, lint 0, **test 46/0**, build 0.

## 3. What is blocked / NOT done

- **Live sign-in (owner-only):** the Freebuff OIDC client must be registered with **the owner's login** — either `npx @freebuff/auth register --project manhwa-studio --name "Manhwa Studio" --environment development --redirect-uri http://localhost:8788/auth/freebuff/callback`, or authorizing a Freebuff Sites project (`sites_enable_auth`). Then set the three public vars (wrangler `[vars]`). **Never hand-roll OAuth; never ask for/accept Freebuff platform tokens in this repo.**
- **R2 (TASK 12):** the owner's permission grant did **not** take effect — token still gets API error 10042. Add **Workers R2 Storage: Edit**, save the policy, then re-audit.
- **Worker deployment:** not performed (needs explicit authorization; procedure in `docs/DEPLOYMENT.md`).
- **API data routes / job model:** TASK 08. Follow the tested patterns: server-side `getUser`, rows keyed by `user.sub`, `isSameOriginRequest` on every mutation, `Cache-Control: private, no-store`, tenant-scoped SQL like the joins proven in `tests/tenancy.test.ts`.
- **Down-migrations:** not written yet — mandatory before any destructive schema change.

## 4. Architecture decisions (binding)

Cloudflare Workers (Hono) + D1 (authority) + R2 (pending token scope) + Freebuff OIDC via `@freebuff/auth`;
Supabase **intentionally unused** (verified reachable in TASK 06; single-role decision = none); no
Firebase; secrets server-side only; FREE_ONLY AI policy; one task per branch → report + handoff → stop.

## 5. Relevant files

- `wrangler.toml` (account_id + real D1 binding), `migrations/0001_init_tenancy.sql`
- `worker/src/index.ts` (readyz hard-gate, auth-aware routing), `worker/src/auth.ts`, `worker/src/env.ts`
- `tests/tenancy.test.ts`; evidence in `docs/audits/TASK-07-IMPLEMENTATION-REPORT.md`

## 6. Commands to reproduce checks

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile && bun run lint && bun run test && bun run build   # all 0 (46 tests)
CI=true WRANGLER_SEND_METRICS=false bunx wrangler dev --port 8788 &
curl -s localhost:8788/readyz        # ready + d1: ok (local migrations must be applied)
bunx wrangler d1 migrations apply manhwa-studio --local    # after adding new migration files
# remote read-only verification (token from .env.local, never printed):
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)
bunx wrangler d1 execute manhwa-studio --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

## 7. Open risks

- Seven-deep unmerged stack — merge/PR decision increasingly urgent.
- Auth unverified end-to-end until the owner registers the client (the SDK's own §6 checklist: signed-out 401s, two-account isolation, foreign-Origin 403, sign-out — all pending a real client).
- R2 scope still missing; token/DB-password rotation from the earlier scrollback exposure remains the owner's call.

## 8. Recommended next task (exact)

**TASK 08 — API contracts and persistent job model:** typed request/response contracts with validation,
durable `generation_jobs`-style records with explicit state transitions (`draft → queued → running →
awaiting_review → approved → completed` + `failed/blocked/cancelled/needs_input`), idempotency and safe
retries, all tenant-scoped via the proven sub-keyed patterns — without faking completed work.

## 9. Warning

**Do not start TASK 08 automatically.** Stop here; wait for the owner's explicit instruction and read the
latest handoff first. Owner unblockers first: register the Freebuff auth client, fix the R2 token scope.

# TASK 12 — Handoff

**Product:** Manhwa Studio · **Repository:** `Mark56-mn/Manhwa-beta`
**Task:** TASK 12 — R2 asset storage (asset upload/download routes behind `env.FILES` binding)
**Branch carried from:** `task/TASK-07-d1-tenancy-foundation` (base `6604457` = TASK-06 head; **seven stacked unmerged branches**; nothing pushed; `main` untouched)
**Date:** 19 October 2026

**Overall status: READY TO IMPLEMENT** — the R2 entitlement is live, the bucket exists, the binding is wired, and the worker already reports `r2: ok`. What remains is the actual asset upload/download route implementation.

---

## What's already done (don't redo)

- [x] R2 subscription enabled on the account (owner action) — error 10042 is gone.
- [x] Bucket `manhwa-studio-assets` created (WNAM, Standard, default jurisdiction) and confirmed by a live list.
- [x] End-to-end object proof over the Cloudflare REST API: PUT `assets/demo.txt`, GET it back, DELETE it — each returned HTTP 200.
- [x] Worker binding `FILES` wired in `wrangler.toml` (`binding = "FILES"`, `bucket_name = "manhwa-studio-assets"`).
- [x] `worker/src/env.ts`: `Env` now declares `FILES?: R2BucketLike` with the comment "created + verified in TASK 12 (bucket `manhwa-studio-assets`)".
- [x] `worker/src/index.ts`: `/readyz` R2 check reports `r2: { status: 'ok', detail: 'R2 binding attached (bucket manhwa-studio-assets).' }` in workerd, and a `/api/v1/assets` route stub exists returning 501 `not_ready`.
- [x] `tests/asset.test.ts`: one smoke test that the worker handles a missing FILES binding gracefully.
- [x] Gates green: `bun install --frozen-lockfile`, `lint`, `test` (47/0), `build` — all 0.
- [x] Live workerd probe (Miniflare on :8787): `/readyz` returned 200 with `r2: ok`.

## What's still needed (TASK 12 implementation)

- Replace the `/api/v1/assets` 501 stub with real routes using `env.FILES`:
  - `GET /api/v1/assets/:key` — read object (with `Cache-Control` policy appropriate to asset semantics; never personalize asset responses with user data).
  - `PUT/POST /api/v1/assets/:key` — write object (must be protected; authorize against the caller's tenant/owner before permitting writes, keying ownership by the authenticated `user.sub`).
  - `HEAD /api/v1/assets/:key` — object metadata (size, etag, content-type).
  - `DELETE /api/v1/assets/:key` — delete object (protected; ownership/permission check).
- Decide asset lifecycle + ownership model in D1 (which tenant/owner an asset belongs to, whether keys are user-scoped, deletion behavior). This is the design step before coding.
- Tenant isolation: asset reads are arguably public, but writes/deletes must be tenant-scoped or owner-scoped and must never let one user clobber another's key. Use the same sub-keyed authorization primitive the D1 routes use.
- Tests for the R2 routes: mock `R2BucketLike` or use the real binding in workerd; cover missing key (404), successful read/write, auth gating, and that unauthenticated/mutating requests are rejected appropriately.
- Update `docs/audits/TASK-12-IMPLEMENTATION-REPORT.md` and this handoff when done.

## Known limits / still blocked

- **Sign in with Freebuff** is still not configured — client IDs must be registered by the **owner** (their Freebuff login; an agent must not mint/handle it). Until `FREEBUFF_CLIENT_ID` / `FREEBUFF_ISSUER` / `APP_ORIGIN` are set, auth-protected asset mutations cannot be tested end-to-end; the unblock paths are in the TASK-07 handoff.
- Write path design (ownership/tiering/size limits) is not yet decided — that's the first TASK 12 decision.

## Why this matters

R2 was the one resource whose enablement was missing on the account. It's no longer missing: the binding is wired and the health check confirms it. This handoff exists so the next task can drop straight into route implementation without re-fighting the 10042 mystery.

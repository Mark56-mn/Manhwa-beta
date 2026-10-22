# TASK 12 — Handoff

**Product:** Manhwa Studio · **Repository:** `Mark56-mn/Manhwa-beta`
**Task:** TASK 12 — R2 asset storage (asset upload/download routes behind `env.FILES` binding)
**Branch carried from:** `task/TASK-07-d1-tenancy-foundation` (base `6604457` = TASK-06 head; **seven stacked unmerged branches**; nothing pushed; `main` untouched)
**Date:** 19 October 2026

**Overall status: ROUTES IMPLEMENTED, hardening + verification in progress** — the R2 entitlement is live, the bucket exists, the binding is wired, and the worker already reports `r2: ok`. The asset upload/download routes are implemented in ``worker/src/assets.ts`` and covered by ``tests/asset.test.ts``. What remains is final hardening/verification and docs/traceability updates; true end-to-end auth still depends on the owner registering the Freebuff OIDC client.

> **Reconciled 22 October 2026 (ROADMAP TASK 02).** Every route listed under "What's still needed" below is
> **implemented and covered by `tests/asset.test.ts`**; that section is now a design record, not a to-do list.
> This branch was pushed and integrated into `task/TASK-01-reconcile-ci` ("nothing pushed" and "seven
> stacked branches" no longer apply), and the suite is **59 tests / 5 suites**. What the tests cannot prove:
> no Worker is deployed, so the routes have never run against the live bucket, and the live bucket state
> itself is reported by this task rather than re-verified. **No `TASK-12-IMPLEMENTATION-REPORT.md` was ever
> written** — this handoff is the only TASK 12 record.

---

## What's already done (don't redo)

- [x] R2 subscription enabled on the account (owner action) — error 10042 is gone.
- [x] Bucket `manhwa-studio-assets` created (WNAM, Standard, default jurisdiction) and confirmed by a live list.
- [x] End-to-end object proof over the Cloudflare REST API: PUT `assets/demo.txt`, GET it back, DELETE it — each returned HTTP 200.
- [x] Worker binding `FILES` wired in `wrangler.toml` (`binding = "FILES"`, `bucket_name = "manhwa-studio-assets"`).
- [x] `worker/src/env.ts`: `Env` now declares `FILES?: R2BucketLike` with the comment "created + verified in TASK 12 (bucket `manhwa-studio-assets`)".
- [x] `worker/src/index.ts`: `/readyz` R2 check reports `r2: { status: 'ok', detail: 'R2 binding attached (bucket manhwa-studio-assets).' }` in workerd; asset routes are served from `worker/src/assets.ts` via the existing `/api/v1/assets/*` delegation.
- [x] `tests/asset.test.ts`: asset route tests using an in-memory D1 shim + ``MockR2Bucket``; covers missing binding / missing Freebuff client honest errors (503), 401 when unauthenticated, 404 unknown asset, 403 cross-organization, org-scoped listing, create round-trip into D1 + R2, project-belonging guard, disallowed content type, oversize upload (413), asset deletion from D1 + R2, cross-org delete rejection, and same-origin mutation guard.
- [x] Gates green (current): ``bun install --frozen-lockfile``, `lint` (``tsc --noEmit``), `test`, `build` — all 0.
- [x] Live workerd probe (Miniflare on :8787): `/readyz` returned 200 with `r2: ok`.

## What's still needed (TASK 12 implementation) — completed, kept as the design record

- Implemented routes in ``worker/src/assets.ts``:
  - ``GET /api/v1/assets`` — list assets scoped to the caller's organization.
  - ``GET /api/v1/assets/:id`` — read asset metadata + body streamed from R2 (``private, max-age=3600``).
  - ``HEAD /api/v1/assets/:id`` — metadata headers only (size, etag, content-type).
  - ``PUT /api/v1/assets`` — create asset: authenticated, org-scoped, content-type allow-listed, size-capped (``MAX_UPLOAD_BYTES = 10 MiB``), server-generated R2 key, D1 record + R2 object written together.
  - ``DELETE /api/v1/assets/:id`` — delete asset: remove D1 record + R2 object.
  - Auth gating, same-origin mutation guard, and tenant scoping use the same primitives as the D1 routes.
- Decide asset lifecycle + ownership model in D1 (which tenant/owner an asset belongs to, whether keys are user-scoped, deletion behavior). This is the design step before coding.
- Tenant isolation: asset reads are arguably public, but writes/deletes must be tenant-scoped or owner-scoped and must never let one user clobber another's key. Use the same sub-keyed authorization primitive the D1 routes use.
- Tests for the R2 routes: mock `R2BucketLike` or use the real binding in workerd; cover missing key (404), successful read/write, auth gating, and that unauthenticated/mutating requests are rejected appropriately.
- Update `docs/audits/TASK-12-IMPLEMENTATION-REPORT.md` and this handoff when done.

## Known limits / still blocked

- **Sign in with Freebuff** is still not configured — client IDs must be registered by the **owner** (their Freebuff login; an agent must not mint/handle it). Until `FREEBUFF_CLIENT_ID` / `FREEBUFF_ISSUER` / `APP_ORIGIN` are set, auth-protected asset mutations cannot be tested end-to-end; the unblock paths are in the TASK-07 handoff.
- Write path design decisions were made in-code for the current scope: ownership is organization-project-scoped via the D1 ``assets`` row; R2 keys are server-generated opaque strings (``org/{org_id}/proj/{project_id}/asset/{asset_id}/{filename}``); writes/deletes are gated by authenticated ``user.sub`` plus the same-origin rule and project-belonging check; upload cap is 10 MiB and the content-type allow-list is defined in ``ASSET_CONTENT_TYPE_ALLOWLIST``. Further tiering/public-vs-private decisions are explicitly out of scope for the current pass.

## Why this matters

R2 was the one resource whose enablement was missing on the account. It's no longer missing: the binding is wired and the health check confirms it. This handoff exists so the next task can drop straight into route implementation without re-fighting the 10042 mystery.

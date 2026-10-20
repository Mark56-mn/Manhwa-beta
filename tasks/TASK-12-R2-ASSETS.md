# TASK 12 — R2 asset storage

**Product:** Manhwa Studio · **Repo:** `Mark56-mn/Manhwa-beta`
**Branch:** from `task/TASK-07-d1-tenancy-foundation` (base `6604457` = TASK-06 head; seven stacked unmerged branches; nothing pushed; `main` untouched)
**Date:** 19 Oct 2026

## Goal

Add asset upload/download routes behind the now-live `env.FILES` R2 binding (`manhwa-studio-assets`, WNAM, Standard), with the same auth + tenant-isolation discipline as the D1 routes.

## Already done (do not redo)

- R2 subscription enabled on the account (was error 10042 = account entitlement, not token permission; the token already had Workers R2 Storage Write/Read).
- Bucket `manhwa-studio-assets` created and verified end-to-end via Cloudflare REST API (PUT / GET / DELETE → 200).
- Worker binding `FILES` wired in `wrangler.toml`; `/readyz` reports `r2: ok` in workerd.
- `worker/src/env.ts` declares `FILES?: R2BucketLike`; the TASK-12 asset router `worker/src/assets.ts` is implemented and covered by `tests/asset.test.ts` (list, read, head, create, delete, auth gating, tenant scoping, same-origin mutation guard, content-type allow-list, size cap).

## Decisions

### Ownership model (app-level, since R2 has no per-object ACL)

- Assets belong to an **organization project**, not directly to a user. An asset row lives in D1, keyed by `organization_id` + `project_id`, with the R2 key stored as a server-generated opaque string.
- R2 keys are **server-generated**, e.g. `org/{organization_id}/proj/{project_id}/asset/{asset_id}/{filename}`. Clients never supply the R2 key; they reference assets by D1 asset id.
- **Reads:** assets can be read by members of the owning organization (membership check in D1). Public-vs-private is a future decision; for now, treat all asset reads as org-member-scoped (consistent with the existing tenancy model).
- **Writes/deletes:** restricted to org membership; an optional owner/admin-only check can be added later. Mutations must be gated by authenticated `user.sub` and the same-origin rule for state-changing routes.
- **No emails**, identity by OIDC `sub`, same as the rest of the app.
- **Size/content limits:** record `content_type`, `size`, `etag` in D1. Reject uploads above a reasonable app limit at the Worker (e.g. 10 MiB body) before pushing to R2, and validate `content_type` allow-list for the asset kinds the app supports. Exact limits are a decision point — record whatever we pick.

### API surface

- `GET /api/v1/assets/:id` — read asset metadata + body redirect/proxy decision. Return D1 asset record; serve the body from R2 with appropriate Cache-Control. For now proxy through the Worker (binding get) rather than presigned URLs, since direct binding writes/reads let us validate and coordinate D1 state.
- `HEAD /api/v1/assets/:id` — headers only: size, etag, content-type, Cache-Control. No body.
- `PUT /api/v1/assets` — create asset: authenticated, tenant-scoped; accept body + content_type; server-generate R2 key; write to R2; insert D1 asset record; return asset id + R2 etag/size. Protected (getUser, 401 if signed out, same-origin for mutation).
- `DELETE /api/v1/assets/:id` — delete asset: remove D1 record + R2 object. Protected; ownership/membership check.

### Caching

- Private/org-scoped assets: do **not** make the bucket public. Serve through the authenticated worker; set conservative Cache-Control (no shared/CDN caching of a user-authorized response unless we design an explicit cache key). Do **not** personalize asset responses with user data.
- If we later need public CDN-cached assets, use a separate public bucket or public namespace + custom domain, not the same private bucket as a shortcut.

### Why not presigned URLs yet

Direct binding writes/reads are simpler and keep D1 coordination + validation in the Worker. Presigned PUT URLs reduce Worker bandwidth for large browser uploads, but they require careful key selection, upload validation, CORS, short expiry, and post-upload reconciliation; that's a later optimization, not the first implementation.

## Out of scope for this task

- Public CDN delivery with custom domain / public bucket.
- Multipart uploads for very large files (single-part put is fine for the app's expected asset sizes; document the limit we reject at).
- The Freebuff OAuth client (still owner-only; see TASK-07 handoff).

## Verification

- Full gates: `bun install --frozen-lockfile`, `lint`, `test`, `build` — all 0.
- Asset route tests: mock `R2BucketLike` + D1-in-memory; cover missing key (404), successful read/write/delete, auth gating, tenant scoping, and that mutating routes reject unauthenticated requests.
- wrangler dev workerd probe: `/readyz` r2:ok; `GET/HEAD/PUT/DELETE /api/v1/assets` answers as designed; mutations reject when not authenticated.

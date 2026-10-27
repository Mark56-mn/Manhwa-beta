# TASK 10 — Deploy the Worker and connect the frontend

**Repository:** `Mark56-mn/Manhwa-beta`
**Start from:** `task/TASK-09-PRODUCTION-READINESS`
**Read first:** [`docs/audits/TASK-09-PRODUCTION-READINESS-REPORT.md`](../docs/audits/TASK-09-PRODUCTION-READINESS-REPORT.md)
and [`docs/handoffs/TASK-09-PRODUCTION-READINESS-HANDOFF.md`](../docs/handoffs/TASK-09-PRODUCTION-READINESS-HANDOFF.md)

## Objective

Produce the **first working, live, owner-hosted Manhwa Beta backend** on Cloudflare — this repository's
Worker against the **existing** D1 `manhwa-studio` and R2 `manhwa-studio-assets` — and make sign-in work
from the browser. No new database, no new bucket, no new identity provider.

## Preconditions (all must be true before step 4)

- [ ] `bun run migrations:check` exits **0** (the untracked `migrations/0002_assets.sql` has been moved
      aside by the owner — preserved at `/tmp/...`, **not** deleted).
- [ ] The owner has authorized the first deploy and the first remote migration.
- [ ] A hostname exists: the account's `workers.dev` subdomain, **or** a custom domain on the active
      `oppa-technologies.online` zone (id `27fc0052c37507c9ef98f9ff1d306a3f`).
- [ ] A D1 restore bookmark has been captured (`wrangler d1 time-travel info manhwa-studio`).
- [ ] The owner is present to complete OIDC registration (their Freebuff login is required).

## Steps

1. **Re-verify state** (read-only): `wrangler whoami`, `d1 list`, `r2 bucket list`,
   `wrangler deploy --dry-run`. Confirmed baselines: D1 `d9557398-b439-463a-b5aa-a3703d5c3fdb` (7 tables,
   111 kB), R2 `manhwa-studio-assets`, **0 Worker scripts**, no `workers.dev` subdomain.
2. **Quarantine the stray migration**, then re-run `bun run migrations:check` → expect exit 0.
3. **Local rehearsal** (already passing, repeat to confirm): apply the tracked chain to a throwaway local
   D1 and confirm all 15 application tables exist.
4. **First deploy:** `bunx wrangler deploy`. Record the real origin.
5. **First remote migration:** `bunx wrangler d1 migrations apply manhwa-studio --remote`. Confirm
   `d1_migrations` holds `0001`, `0002_assets_and_replication.sql`, `0003_story_generation.sql` and that
   `assets` still holds any pre-existing rows. If anything looks wrong, use the captured bookmark —
   **there are no down-migrations**.
6. **Identity:** register the OIDC client for the deployed origin
   (`--redirect-uri https://<origin>/auth/freebuff/callback`), then set the public vars
   `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN` (the API's own origin) and `ALLOWED_ORIGINS`
   (exact frontend origins only). Redeploy if they were added to `wrangler.toml`.
7. **Prove the backend:** `/healthz` 200; `/readyz` 200 with `d1: ok`, `r2: ok`, `auth: ok`,
   `origins: ok`; `node scripts/verify-deployment.mjs --api <origin> --origin <frontend>` exit 0;
   `GET /api/v1/me` → 503 before the OIDC client, 401 signed out, 200 after sign-in.
8. **Prove provisioning:** sign in with a fresh account and confirm **exactly one** organization and an
   `owner` membership appear, plus one `organization.provisioned` audit event — and that a reload does
   **not** create a second one. Then confirm `GET /api/v1/projects` returns 200 (not 403).
9. **Connect the frontend** using the **same-origin proxy** topology (report §4.2): add the `/api/:path*`
   and `/auth/:path*` rewrites to `vercel.json *above* the SPA catch-all, keep `VITE_API_BASE_URL` empty,
   redeploy. Do **not** instead point `VITE_API_BASE_URL` at another site and expect the `__Host-` cookie to
   follow — it will not.
10. **Decide the stale Freebuff site's fate:** leave it published but documented as non-authoritative, or
    unpublish it. One backend must be authoritative.
11. **Optional:** set `GEMINI_API_KEY` + `GEMINI_MODEL` as Worker secrets only if AI generation is wanted
    now; without them the app answers `provider_not_configured` honestly and charges nothing.

## Do not

- Do not create a second D1 database, R2 bucket or identity provider.
- Do not apply migrations before the preflight is green.
- Do not put any server-side value in a `VITE_*` variable.
- Do not merge to `main`, force-push, or rewrite an existing task branch.
- Do not record secret values in the repo, docs, logs or chat.

## Acceptance criteria

- A verified user can sign in from the frontend and use the shared workspace against the owner's D1.
- `/readyz` reports every dependency `ok` on the live origin.
- Exactly one organization exists per first-time user, and repeated sign-ins create none.
- The frontend makes no cross-site cookie requests (single origin from the browser's point of view).
- Every claim in the report is backed by a command output pasted into it.

## Known risks

- **Cookie topology** — the single most likely failure (§4 of the TASK 09 report).
- **Migration order** — a stray file in `migrations/` aborts the whole apply; the preflight exists for this.
- **No rollback for data** — worker rollback does not undo a migration; use the time-travel bookmark.
- **Two divergent databases** exist historically (a platform-owned one and the owner's); the owner's is
  authoritative from step 5 onward.

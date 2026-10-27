# TASK 08 — Handoff: backend recovery and deployment preparation

**From:** TASK 08 backend-recovery agent
**To:** the repository owner, then the next engineering agent
**Date:** 27 October 2026
**Branch:** `task/TASK-08-BACKEND-RECOVERY` — **documentation only; no code, schema or infrastructure change**

Read first: [`docs/audits/TASK-08-BACKEND-RECOVERY-REPORT.md`](../audits/TASK-08-BACKEND-RECOVERY-REPORT.md)
(the evidence and the checklist), then `docs/DEPLOYMENT.md` (the procedure).

## 1. State in one paragraph

The backend is **not down** — the Freebuff-hosted site answers 200/200/401 and its hosting quota is
`active`. What it is, is **stale**: it predates `fe80671` (23 Oct), so the shared-workspace routes it
needs do not exist there (`/api/v1/projects` → 404), it emits **no CORS headers**, and it serves **no
frontend**. Meanwhile the **owner's own Cloudflare account is already provisioned and empty of code**:
D1 `manhwa-studio` with migration `0001` applied and every table empty, R2 `manhwa-studio-assets`, a
`wrangler.toml` that matches both, and **zero Worker scripts** with **no `workers.dev` subdomain**. The
Worker builds for workerd, the token works, and the only thing standing between this repository and a
live backend is a **first deploy** plus a **stale-schema fix**. A Vercel frontend is also already live at
<https://manhwa-beta.vercel.app> — built, however, with **no API origin**, so it is disconnected by
construction.

## 2. Do this first (mandatory, before any migration)

```bash
mv migrations/0002_assets.sql /tmp/0002_assets.sql.stray
```

It is an untracked duplicate of the tracked `0002_assets_and_replication.sql` and it **aborts the whole
apply**: reproduced on the local database as
`✘ [ERROR] table assets already exists at offset 268: SQLITE_ERROR`. Because it sorts first, a remote
`wrangler d1 migrations apply --remote` would fail on it and leave `0002`/`0003` **unapplied**. It is not
in any commit, so nothing is lost by moving it.

## 3. Exact commands (read-only first)

```bash
export PATH="$HOME/.bun/bin:$PATH"
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)
bunx wrangler whoami                                           # 1 account: 78bd087d…
bunx wrangler d1 migrations list manhwa-studio --remote        # 0002_assets.sql, 0002_assets_and_replication.sql, 0003_story_generation.sql
bunx wrangler d1 time-travel info manhwa-studio                # verified available; prints the bookmark to restore to
bunx wrangler deploy --dry-run --outdir=/tmp/dryrun            # 192.20 KiB / gzip 44.12 KiB — uploads nothing
node scripts/verify-deployment.mjs --api <API origin> --origin <frontend origin> --frontend <frontend URL>
```

Then, once authorized: `bunx wrangler deploy`, `bunx wrangler d1 migrations apply manhwa-studio --remote`,
set the vars/secrets, register the OIDC callback, and set `VITE_API_BASE_URL` on Vercel. The full
grouped checklist is §4 of the report.

## 4. Owner actions, in order

1. **Authorize the plan** — in particular the Group 4 steps (deploy, remote migration, production seed).
2. **Decide the authoritative database.** Two D1s exist: the platform-bound one inside the Freebuff site
   (180 KB, `site-1d7d7016…`, on Freebuff's account) and the owner's `manhwa-studio` (111 KB, `0001`
   applied). Recommendation: **the owner's**. Deploying to the owner's account creates no duplicate
   infrastructure because that D1 and R2 already exist.
3. **Give the Worker a hostname**: open Workers & Pages once (creates the `workers.dev` subdomain), or
   attach a custom domain. The zone `oppa-technologies.online` is **active on this account**, so
   `manhwa-api.oppa-technologies.online` is available at no separately listed cost.
4. **Register the Freebuff OIDC client** for the deployment origin (owner's login required):
   `npx @freebuff/auth register … --redirect-uri https://<origin>/auth/freebuff/callback`. The existing
   client `942e460d-c8fb-45f4-9005-8b497eb1c6a7` can simply take an extra redirect URI (append-only),
   which keeps one identity provider.
5. **Set `ALLOWED_ORIGINS`** to the frontend origin(s) — exact match, no wildcards.
6. **Optional:** `GEMINI_API_KEY` + `GEMINI_MODEL` as Worker secrets (generation stays honestly
   unavailable, and free, without them).
7. **Point the frontend at the API**: set `VITE_API_BASE_URL` (origin only) for Production **and**
   Preview on Vercel and redeploy. Note that changing it requires a new deployment.
8. **Decide the stale site's fate.** Leaving the Freebuff site published is harmless but it must be
   treated as **non-authoritative**; `sites_set_published(published: false)` takes it offline while
   keeping its data.

## 5. Known limitation you must not paper over

The session cookie is `__Host-…; SameSite=Lax` — **host-only**. So:

- same origin → sign-in works;
- `app.example.com` + `api.example.com` (one registrable domain) → works;
- `*.vercel.app` + `*.workers.dev` / `*.freebuff.page` → **the cookie is never sent; sign-in cannot
  work**, and every call will honestly 401.

If sign-in must work with a separately hosted frontend, use **one parent domain** (the active
`oppa-technologies.online` zone makes this a configuration step, not a rewrite). Alternatively serve the
SPA from the Worker itself for a single origin — that needs one small code addition
(`env.ASSETS.fetch` fallback) plus assets in the deploy.

## 6. The one real functional gap

`firstOrganizationForUser` only reads `organization_memberships`, and **every** `INSERT INTO
organizations` / `INSERT INTO organization_memberships` in the repository is in a **test** file. The live
database has `organizations 0`, `users 0`. A successfully signed-in user therefore gets
**403 "Not a member of any organization"** on every shared-workspace call. Deploying does not fix this;
it needs a small idempotent server-side provisioning step (or a one-time owner-approved seed using their
own `sub`). **This is the next task.**

## 7. Open risks

- The stray migration (§2) is a live trap until moved.
- No down-migrations exist anywhere; the only restore path is D1 time-travel / export.
- If `ALLOWED_ORIGINS` is wrong or a cookie topology is assumed rather than chosen, the app will look
  broken while behaving honestly — check `/readyz` `origins` and the verifier before blaming the code.
- The untracked stray file was **left in the working tree** on purpose (no user file was deleted).
- `git push`/PR creation for this branch: pushing uses the platform's GitHub credential; **no PR was
  created** (no `gh`/`GITHUB_TOKEN` in this environment). Use
  <https://github.com/Mark56-mn/Manhwa-beta/pull/new/task/TASK-08-BACKEND-RECOVERY>.

## 8. Explicitly not done

No deploy, no remote migration, no production data write, no OIDC registration, no secret or production
setting changed, no paid service, no AI spend, no merge, no force-push, no change to `main` or to any
existing task branch. Resource counts were re-checked after every probe: the account still has **zero
Worker scripts**.

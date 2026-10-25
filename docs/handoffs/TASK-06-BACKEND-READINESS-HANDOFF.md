# TASK 06 — Backend Readiness and Frontend Integration: handoff

**From:** TASK 06 agent
**To:** next Manhwa Studio engineering agent
**Date:** 25 October 2026
**Branch:** `task/TASK-06-BACKEND-READINESS` (base `main` `d0eba90`)
**Full detail:** [`docs/audits/TASK-06-BACKEND-READINESS-REPORT.md`](../audits/TASK-06-BACKEND-READINESS-REPORT.md)

---

## 1. Read this first

1. **Nothing was deployed, merged, migrated, registered or reconfigured.** The branch is pushed for
   review only; no pull request was merged (and none was opened — see §7).
2. **Both live artefacts are stale relative to this repository**, and that is why the app is
   disconnected:
   - the Vercel frontend was **built without `VITE_API_BASE_URL`** (the bundle contains the client's
     configuration diagnostics but no API origin);
   - the live Worker is a **22 October build** — `/api/v1/projects` and `/api/v1/credits` answer
     `404`, `OPTIONS` answers `404`, and **no** `Access-Control-Allow-Origin` is emitted.
3. `/healthz` and `/readyz` on the live API both return **200**. That is not evidence of a working
   backend: an older build passes both while serving none of the routes the frontend calls.
4. The frontend is honest about this today: its own `/api/*` returns `index.html`, which the client
   converts into `api_misconfigured` with the remedy, never into a fake empty workspace.

## 2. Branch state

| Item | Value |
|---|---|
| Branch | `task/TASK-06-BACKEND-READINESS` |
| Base | `main` `d0eba90` |
| Task commit | see the tip of the branch (`git log -1`) |
| Files changed | `src/lib/cloudWorkspace.ts`, `src/components/CloudWorkspacePanel.tsx`, `scripts/verify-deployment.mjs`, `tests/cloud-workspace.test.ts`, `tests/readiness.test.ts` (new), `tests/deployment-verifier.test.ts` (new), `docs/DEPLOYMENT.md`, `docs/DEPLOYMENT-VERCEL.md`, `tasks/TASK-06-BACKEND-READINESS.md` (new), the report, this handoff |
| `package.json` / `bun.lock` | unchanged |

## 3. Commands executed and their actual results

| Command | Exit | Result |
|---|---|---|
| `bun install --frozen-lockfile` | 0 | 126 packages, lockfile unchanged |
| `bun run lint` (`tsc --noEmit`) | 0 | clean |
| `bun test` | 0 | **294 pass / 0 fail**, 941 asserts, 20 files (275/18 before) |
| `bun run build` | 0 | `index-DUqTSuJe.js` 716.65 kB (gzip 204.35), css 40.97 kB |
| bundle secret scan | — | no key/token/UUID; only `mask-type`/`task-` matched `sk-` |
| `bunx wrangler deploy --dry-run` | 0 | 192.20 KiB (gzip 44.12), D1 + R2 bindings resolve |
| `bunx wrangler d1 migrations apply manhwa-studio --local` | 0 | `0003` applied (13 statements); `0001`/`0002` were already applied locally |
| `wrangler dev` + `vite preview` + verifier | 0 | **9/9 checks passed** |
| verifier against the **live** pair | 1 | **5/9** — CORS read, preflight, routes, bundle origin (see report §3.3) |

## 4. Tests added (17) and changed

- `tests/readiness.test.ts` (14) — liveness without bindings, readiness 503/200 paths, honest R2/auth/
  origins states, **no secret/origin/client-id value in any response**, credentialed CORS read,
  preflight contents, wildcard refusal, foreign-origin 403.
- `tests/deployment-verifier.test.ts` (3) — the real script against local servers: correct pair → 9/9
  exit 0; stale API → exit 1 naming the missing routes (liveness/readiness still pass); bundle
  without the API origin → exit 1 naming `VITE_API_BASE_URL`.
- `tests/cloud-workspace.test.ts` — `network`/`timeout` now map to the new `unavailable` state; a
  server that answered with an error stays `error`.

## 5. Verified frontend / backend state

| Thing | Verified value |
|---|---|
| Frontend URL | `https://manhwa-beta-frontend.vercel.app` — live, 200, SPA fallback OK |
| Frontend build | no API origin inlined → `VITE_API_BASE_URL` unset at build time |
| Backend URL | `https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page` (Freebuff Sites production, `published: true`, deployed 2026-10-22T11:25:44Z) |
| Backend build | **stale**: no CORS layer, no projects/story/credits routes |
| D1 | `/readyz` reports `d1: ok` (SELECT 1). Schema version of that live database is **unknown** — it is the platform-provided database for that site, not the `manhwa-studio` D1 in `wrangler.toml` |
| R2 | `/readyz` reports `r2: ok` (bucket attached) |
| Authentication | `/readyz` reports `auth: ok` (an OIDC client exists **for that deployment**); `/api/v1/me` answers `401` — but without CORS headers, so a browser cannot use it |
| Migrations `0002`/`0003` | applied to the **local** D1 only; **not** applied to any live database by this task |

## 6. Blocked on owner action (exact steps, in order)

```bash
# 1. Load the Cloudflare token without printing it
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)

# 2. Apply the additive migrations to the owner's D1 (AUTHORIZED ACTION; IF NOT EXISTS only)
bunx wrangler d1 migrations apply manhwa-studio --remote

# 3. Deploy the CURRENT Worker with its public configuration
bunx wrangler deploy \
  --var APP_ORIGIN:https://<api-origin> \
  --var ALLOWED_ORIGINS:https://manhwa-beta-frontend.vercel.app

# 4. Register the API origin with Sign in with Freebuff, then redeploy adding the two public ids
npx @freebuff/auth register --project manhwa-studio --name "Manhwa Studio" \
  --environment production --redirect-uri https://<api-origin>/auth/freebuff/callback
bunx wrangler deploy \
  --var APP_ORIGIN:https://<api-origin> \
  --var ALLOWED_ORIGINS:https://manhwa-beta-frontend.vercel.app \
  --var FREEBUFF_CLIENT_ID:<client-id> \
  --var FREEBUFF_ISSUER:https://freebuff.com/oidc

# 5. Vercel → Settings → Environment Variables: VITE_API_BASE_URL=https://<api-origin>
#    for Production AND Preview, then redeploy (build-time variable).

# 6. Verify before claiming success
node scripts/verify-deployment.mjs \
  --api https://<api-origin> \
  --origin https://manhwa-beta-frontend.vercel.app \
  --frontend https://manhwa-beta-frontend.vercel.app
# require exit 0
```

Notes:
- `ALLOWED_ORIGINS` is an exact list; each `*.vercel.app` preview origin that is actually used must be
  listed, or the project needs a stable preview domain.
- `GEMINI_API_KEY` + `GEMINI_MODEL` are Worker **secrets** (`bunx wrangler secret put NAME`), not
  `--var` values, and never `VITE_*`.
- Sign-in from a Vercel origin still needs a topology decision (shared parent domain, e.g.
  `app.example.com` + `api.example.com`, or a same-origin proxy). Redeploying alone cannot fix a
  host-only session cookie.
- Then one **human** browser pass: sign in, create one cloud project, reload, confirm it persists.
  Nothing in this task proves persistence end to end.

## 7. Why there is no pull request

The branch is committed and pushed. Opening a pull request needs GitHub API credentials, which this
environment does not have (`gh auth status` is not logged in; no `GITHUB_TOKEN`). The comparison URL
is `https://github.com/Mark56-mn/Manhwa-beta/compare/main...task/TASK-06-BACKEND-READINESS`.

## 8. Exact next task

**TASK 07 — readiness schema probe.** `/readyz` currently proves connectivity (`SELECT 1`) and not
that `0001`–`0003` are present. Add a `schema` check that reads `sqlite_master` for the tables the
routes require, reports `degraded` with the missing table names (never data or secrets), and covers
both an unmigrated and a fully migrated database in tests. This closes the last way a deployment can
report `ready` while being unable to serve its own routes.

After that: an authenticated end-to-end test (session cookie → create project → reload) as soon as an
OIDC client for the reviewed deployment exists, plus the topology decision for cross-site sign-in.

## 9. Reproduce this task's evidence

```bash
bun install --frozen-lockfile
bun run lint && bun test && bun run build
bunx wrangler deploy --dry-run --outdir /tmp/wrangler-dry

# local stack (real workerd + local D1/R2)
bunx wrangler d1 migrations apply manhwa-studio --local
VITE_API_BASE_URL=http://127.0.0.1:8799 bun run build
bunx wrangler dev --port 8799 --var APP_ORIGIN:http://127.0.0.1:8799 --var ALLOWED_ORIGINS:http://127.0.0.1:4173 &
bunx vite preview --port 4173 --host 127.0.0.1 &
node scripts/verify-deployment.mjs --api http://127.0.0.1:8799 \
  --origin http://127.0.0.1:4173 --frontend http://127.0.0.1:4173
```

## 10. Do not

- Do not merge this branch, deploy a Worker, apply a live migration or change production variables
  without the owner's explicit instruction.
- Do not "fix" a disconnected frontend by pointing it at an invented API URL, and do not remove the
  `api_misconfigured` / `unavailable` states to make a demo look connected.
- Do not put any secret behind a `VITE_` name or into a committed file.

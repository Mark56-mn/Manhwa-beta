# TASK 07 — Branch Reconciliation and Live Backend Deployment Readiness: handoff

**From:** TASK 07 agent
**To:** next Manhwa Studio engineering agent
**Date:** 25 October 2026
**Branch:** `task/TASK-07-BRANCH-RECONCILIATION` (base `main` `d0eba90`)
**Full detail:** [`docs/audits/TASK-07-BRANCH-RECONCILIATION-REPORT.md`](../audits/TASK-07-BRANCH-RECONCILIATION-REPORT.md)

---

## 1. Read this first

1. **`main` already contained the integrated application.** `task/VERCEL-DEPLOYMENT-READINESS`
   (`f0d3503`) and `task/TASK-05-END-TO-END-READINESS` (tip `4993643`, content `a8b65bf`) are
   ancestors of `main` `d0eba90`. No re-merge was needed and nothing was re-merged.
2. **The only unreconciled work was `task/TASK-01-corrective-review`** (`0ed6b08`, 9 commits, merge
   base `49ed52c`). Most of it was already on `main`; the parts that were not are now here — the
   42-test UI suite and three honesty fixes — with its suite-breaking global DOM preload replaced.
3. **Nothing was merged, deployed, migrated, registered or reconfigured.** The branch is pushed for
   review; the pull request is not opened (see §7).

## 2. Branch state

| Item | Value |
|---|---|
| Branch | `task/TASK-07-BRANCH-RECONCILIATION` |
| Base | `main` `d0eba90` |
| Task commit | see the branch tip (`git log -3`); it is the commit whose message starts "Reconcile TASK-01's UI tests…" |
| Incorporated | `main` (which already contains TASK-05 `a8b65bf`/`4993643`, VERCEL `f0d3503`, TASK-03, TASK-04, TASK-IMPLEMENT-SHARED-FOUNDATION) + selected work from `task/TASK-01-corrective-review` `0ed6b08` |
| Not incorporated | TASK-01's `bunfig.toml` preload, its stale duplicates (storage, App wiring, modal copy), its superseded docs |
| Files changed | `package.json`, `bun.lock`, `index.html`, `metadata.json`, `src/data/mockProjects.ts`, `tests/setup/dom.ts` (new), `tests/task01-honesty.test.ts` (new), `tests/task01-render.test.tsx` (new), `tests/task01-interaction.test.tsx` (new), `tests/task01-forms.test.tsx` (new), task file, report, this handoff |
| Unrelated open branch | `task/TASK-06-BACKEND-READINESS` (`053611e`) — backend-readiness states + verifier checks; touches none of the files changed here, so both can land independently |

## 3. Conflicts resolved (detail in the report §3)

| Conflict | Resolution |
|---|---|
| Global happy-dom preload breaks Worker tests (27 reproduced) | preload dropped; scoped harness in `tests/setup/dom.ts`, `bun test --isolate` in `package.json` |
| `screen` binds at import → throwing stub | harness registers DOM first, then `await import('@testing-library/react')` and re-exports it |
| React scheduler firing after teardown | `drainReactWork()` macrotask in `afterAll` before unregistering |
| `index.html` title claimed "AI Webtoon Production" | title/`og:title` changed to "Manhwa Studio — Webtoon Script & Story Studio"; `main`'s newer description kept |
| `metadata.json` claimed "secure YouTube publishing" + server-side Gemini capability | accurate description; `majorCapabilities: []` |
| Sample approval note claimed storyboard rendering | explicit demo note |
| Duplicate storage/App/modal edits | not re-imported (already on `main`) |

## 4. Test results (actual)

| Command | Exit | Result |
|---|---|---|
| `bun install --frozen-lockfile` | 0 | no changes |
| `bunx tsc --noEmit` | 0 | clean |
| `bun run lint` | 0 | clean |
| `bun run test` | 0 | **317 pass / 0 fail, 22 files** (baseline on `main`: 275 / 18) |
| `bun run build` | 0 | `index-Dn0IK5ue.js` 715.09 kB (gzip 204.04), css 41.20 kB |
| secret scan of `dist/` | — | 0 hits for keys, tokens, worker/site/vercel hosts |
| `bunx wrangler deploy --dry-run` | 0 | 192.20 KiB, `env.DB` + `env.FILES` resolve |
| deployment verifier vs local workerd + preview | 0 | **7/7 passed** |

Local Worker behaviour (workerd, real D1/R2 bindings): `/healthz` 200; `/readyz` `ready` with
`d1: ok`, `r2: ok`, `auth: not_configured`, `origins: ok`; `/api/v1/me` and `/api/v1/projects`
`503 auth_not_configured` **with** the exact `Access-Control-Allow-Origin` and credentials; unknown
route 404 with CORS headers; foreign preflight 403.

## 5. Remaining deployment blockers

| # | Blocker | Who |
|---|---|---|
| 1 | The live Worker is a **22 Oct build** without the CORS layer or the projects/credits routes (`/api/v1/projects` → 404) | owner: redeploy |
| 2 | No OIDC client exists for the owner's Worker (local `auth: not_configured`) | owner: register |
| 3 | `ALLOWED_ORIGINS` is unset on the live Worker (no CORS headers emitted) | owner: deploy with it |
| 4 | The Vercel build has no `VITE_API_BASE_URL` inlined, so the browser calls `/api/*` on the static host | owner: set + redeploy |
| 5 | `0002`/`0003` unapplied to any live database; live schema version unknown | owner: authorized `wrangler d1 migrations apply --remote` |
| 6 | `GEMINI_API_KEY` / `GEMINI_MODEL` unset → generation answers `provider_not_configured` | owner: Worker secrets |
| 7 | Sign-in cannot hold a session across `*.vercel.app` ↔ `*.freebuff.page` (host-only cookie) | decision: shared parent domain or same-origin proxy |

## 6. Exact owner actions, in order

```bash
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)

# 1. Additive migrations on the owner's D1 (AUTHORIZED ACTION; IF NOT EXISTS only)
bunx wrangler d1 migrations apply manhwa-studio --remote

# 2. Deploy the current Worker with its public configuration
bunx wrangler deploy \
  --var APP_ORIGIN:https://<api-origin> \
  --var ALLOWED_ORIGINS:https://manhwa-beta-frontend.vercel.app

# 3. Register the API origin for Sign in with Freebuff, then redeploy adding the public ids
npx @freebuff/auth register --project manhwa-studio --name "Manhwa Studio" \
  --environment production --redirect-uri https://<api-origin>/auth/freebuff/callback
bunx wrangler deploy \
  --var APP_ORIGIN:https://<api-origin> \
  --var ALLOWED_ORIGINS:https://manhwa-beta-frontend.vercel.app \
  --var FREEBUFF_CLIENT_ID:<client-id> \
  --var FREEBUFF_ISSUER:https://freebuff.com/oidc

# 4. Worker secrets (never in a file, never in chat)
bunx wrangler secret put GEMINI_API_KEY
bunx wrangler secret put GEMINI_MODEL

# 5. Vercel → Settings → Environment Variables: VITE_API_BASE_URL=https://<api-origin>
#    for Production AND Preview, then redeploy (build-time value).

# 6. Verify before claiming anything
node scripts/verify-deployment.mjs \
  --api https://<api-origin> \
  --origin https://manhwa-beta-frontend.vercel.app \
  --frontend https://manhwa-beta-frontend.vercel.app
# require exit 0
```

Then one human browser pass: sign in, create one cloud project, reload, confirm it persists.

## 7. Pull request

The branch is pushed. **No pull request was opened**: this environment has no GitHub API
credentials (`gh auth status` → not logged in), so only the branch could be created. GitHub printed
the creation link:

`https://github.com/Mark56-mn/Manhwa-beta/pull/new/task/TASK-07-BRANCH-RECONCILIATION`

Comparison: `https://github.com/Mark56-mn/Manhwa-beta/compare/main...task/TASK-07-BRANCH-RECONCILIATION`

PR #4 (`task/TASK-01-corrective-review` → `main`) can be closed once this lands, because this branch
carries the useful part of it; say so in the PR rather than force-updating that branch.

## 8. Recommended next task

**TASK 08 — schema-aware readiness.** `/readyz` proves `SELECT 1`, not that `0001`–`0003` exist, so a
current Worker deployed against a `0001`-only database reports `ready` and then fails the newer
routes — the most likely failure of the deployment above. Add a `schema` check that reads
`sqlite_master` for the required tables, reports `degraded` with the missing names (never data,
never secrets), and is tested against an unmigrated and a fully migrated database.

Then: the cross-site sign-in topology (shared parent domain vs same-origin proxy), and an
authenticated end-to-end test once an OIDC client exists for the reviewed deployment.

## 9. Reproduce this task

```bash
bun install --frozen-lockfile
bunx tsc --noEmit && bun run lint && bun run test && bun run build
bunx wrangler deploy --dry-run --outdir /tmp/wrangler-dry

bunx wrangler d1 migrations apply manhwa-studio --local
VITE_API_BASE_URL=http://127.0.0.1:8799 bun run build
bunx wrangler dev --port 8799 --var APP_ORIGIN:http://127.0.0.1:8799 --var ALLOWED_ORIGINS:http://127.0.0.1:4173 &
bunx vite preview --port 4173 --host 127.0.0.1 &
node scripts/verify-deployment.mjs --api http://127.0.0.1:8799 --origin http://127.0.0.1:4173 --frontend http://127.0.0.1:4173
```

## 10. Do not

- Do not merge, deploy, apply live migrations or change production settings without explicit owner
  authorization.
- Do not reintroduce a global DOM preload: it replaces the Web API globals the Worker tests need.
  Keep DOM registration inside the DOM test files and keep `--isolate`.
- Do not re-import TASK-01 wholesale; its overlapping edits are older duplicates of what `main` has.
- Do not point the frontend at an invented API URL, and do not soften the honesty assertions.

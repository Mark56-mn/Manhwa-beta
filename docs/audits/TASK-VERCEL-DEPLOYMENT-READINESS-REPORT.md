# Vercel Deployment Readiness — implementation report

**Task:** prepare the frontend for a verified Vercel deployment and establish a real
frontend-to-backend configuration.
**Branch:** `task/VERCEL-DEPLOYMENT-READINESS`
**Base:** `1f9d2a6` = tip of `task/TASK-05-END-TO-END-READINESS` (37 commits ahead of `main` `49ed52c`)
**Date:** 24 October 2026
**Executed:** local checks, a local `wrangler dev` (workerd) API, a local production preview, and
read-only public probes of the one known live deployment. **No deployment, merge, migration, or
production configuration change was made.**

---

## 1. Why this branch is based on TASK-05, not TASK-01

`task/TASK-01-corrective-review` (`0ed6b08`) was the reference branch, but it contains **no backend
and no API client at all**:

| Check | `task/TASK-01-corrective-review` | `task/TASK-05-END-TO-END-READINESS` |
|---|---|---|
| `worker/` (Hono API) | absent | present (16 modules) |
| `src/lib/api.ts` (typed client) | absent | 649 lines |
| `src/components/CloudWorkspacePanel.tsx` | absent | present, mounted by `ProjectHub` |
| `migrations/` | absent | `0001`–`0003` |
| `fetch(` in `src/` | **0 occurrences** | only in `src/lib/api.ts` |
| `VITE_API_BASE_URL` | only in docs | real build-time config |

A Vercel deployment from the TASK-01 branch would be a `localStorage`-only demo with no server to
connect to — precisely the "builds fine, application disconnected" outcome this task forbids.
`main` and TASK-01 are untouched; both branches remain intact.

**Merge consequence:** TASK-01's 9 corrective commits (DOM tests, sanitizer, docs) are **not** in
this branch, and this branch's work is not in TASK-01. They must be integrated deliberately — see
the handoff.

---

## 2. What the backend actually is (verified, not assumed)

| Component | Finding | Evidence |
|---|---|---|
| API | Cloudflare Worker (Hono), `worker/src/index.ts`, routes `/healthz`, `/readyz`, `/api/v1/me`, `/api/v1/projects`, `/api/v1/assets/*`, `/auth/freebuff/*` | source |
| Platform | Cloudflare Workers; `wrangler.toml` (`name = manhwa-studio-api`) | source |
| Database | D1 binding `DB`; R2 binding `FILES` | `wrangler.toml`, `/readyz` |
| Auth | Sign in with Freebuff (OIDC via `@freebuff/auth`) cookie session, `credentials: 'include'` | `worker/src/auth.ts`, `src/lib/api.ts` |
| CORS | **Already implemented**: exact-origin allow-list (`APP_ORIGIN` + `ALLOWED_ORIGINS`), credentialed, wildcard impossible | `worker/src/origins.ts`, verified live below |
| Owner's own Worker | **not deployed** | `docs/DEPLOYMENT.md` |
| Live deployment that exists | Freebuff Sites production env, worker `site-ad1c922229fc492d966ca1d060a96319`, `published: true`, deployed 22 Oct 2026 | `sites_list`/`sites_inspect` |
| Live reachability **today** | **503 on every path** (`/`, `/healthz`, `/readyz`, `/api/v1/me`) with `Site temporarily unavailable`; platform quota state `unavailable` — "Hosting usage is being checked. Sites will resume when monitoring is available." | 24 Oct 2026 probes + Sites record |

So the backend origin is **known**, but it is **not currently reachable**. Its 503 is a
platform-side hosting pause (Cloudflare-served, `retry-after: 60`), not an application fault.

---

## 3. Changes made

| File | Change |
|---|---|
| `vercel.json` *(new)* | `framework: vite`, `installCommand: bun install --frozen-lockfile`, `buildCommand: bun run build`, `outputDirectory: dist`, SPA rewrite `/(.*) → /index.html`, and headers: `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, immutable caching for `/assets/*` |
| `src/lib/apiConfig.ts` *(new)* | One explicit resolver for `VITE_API_BASE_URL`: unset → same-origin; bare http(s) origin → configured (normalized); anything else (no scheme, path, query, credentials) → **`invalid`**, never silently treated as same-origin. Exports the two diagnostic strings and `isCrossOriginApi` |
| `src/lib/api.ts` | Uses that resolver; new `ApiErrorKind` `api_not_configured`; an invalid configured value fails every request with an explicit configuration error; a **200 `text/html`** answer with no base URL (the static host's SPA fallback serving `/api/*`) is reported as missing configuration with the fix, not as a generic parse failure; non-JSON error bodies (host outage pages) surface a ≤200-char excerpt instead of a bare status code; same-origin network failure mentions the missing variable |
| `src/lib/cloudWorkspace.ts` | New terminal state `api_misconfigured` and mapping for `api_not_configured`; save-failure message distinguishes it from "signed out" |
| `src/components/CloudWorkspacePanel.tsx` | Year-visible resolved `API: …` line (configured origin / "same origin (VITE_API_BASE_URL unset)" / "VITE_API_BASE_URL is invalid") so a deployment can be checked by eye; renders the `api_misconfigured` state with the remedy and states that browser-local projects are unaffected; when the API is cross-origin, states the host-only-cookie sign-in limitation inline instead of implying sign-in works |
| `.env.example` | Documents the Vercel build settings, the single public variable, its exact accepted form, the "new deployment required" rule, and that the Vercel origin must be added to the Worker's `ALLOWED_ORIGINS` |
| `docs/DEPLOYMENT-VERCEL.md` *(new)* | Full guide: settings table, variable tables (Vercel and Worker), deploy order, verification, cross-site cookie limitation with working topologies, operational-vs-not capability matrix, rollback, blockers |
| `scripts/verify-deployment.mjs` *(new)* | Read-only (GET/OPTIONS only, never a mutation) 7-check deployment verifier: liveness, readiness, credentialed CORS read, credentialed preflight, foreign-origin refusal, SPA root, SPA deep-link fallback |
| `tests/vercel-deployment.test.ts` *(new)* | 15 tests: `vercel.json` contract, `.env.example` contract (no secret behind a `VITE_` name), base-URL resolution table, and five client/state behaviours proving no invented backend |
| `README.md` | Frontend deployment row now points at the guide and states no deployment exists |

**Not changed:** no Worker route, schema, auth, or CORS logic; no dependency; `bun.lock` and
`package.json` are byte-identical to the base (verified via `git diff --stat`).

---

## 4. Verification performed (commands, exits, results)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `bun install --frozen-lockfile` | 0 | "no changes" — lockfile preserved |
| 2 | `bunx tsc --noEmit` | 0 | clean |
| 3 | `bun run lint` | 0 | clean |
| 4 | `bun run test` | 0 | **262 pass / 0 fail**, 821 assertions, 17 files (was 247/16 before this task) |
| 5 | `bun run build` | 0 | `dist/index.html` 1.44 kB, `assets/index-CRYMZQXH.css` 40.90 kB, `assets/index-CZYu5zqt.js` 715.03 kB (gzip 204.02 kB) |
| 6 | Bundle secret scan (`AIza…`, `sk-…`, `service_role`, `GEMINI_*`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_API_TOKEN`, `freebuff.page`, `workers.dev`, `vercel.app`) | — | **0 hits each**; the actual values of `CLOUDFLARE_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_DB_URL` from `.env.local` do not appear in `dist/` |
| 7 | Build-time inlining check: build with `VITE_API_BASE_URL=https://api.inline-check.test` | 0 | origin present in `dist/assets/*.js` (exactly 1 file) — confirms the variable is a **build-time** input |
| 8 | Rebuild without it | 0 | 0 hits — no stale value leaks into a later build |
| 9 | local `wrangler dev --port 8799 --var APP_ORIGIN… --var ALLOWED_ORIGINS:https://example-vercel.test` | — | `/healthz` 200; `/readyz` 200 with `d1=ok r2=ok auth=not_configured origins=ok` (real workerd, real D1/R2 bindings) |
| 10 | local `vite preview --port 4173 --host 127.0.0.1` (production build) | — | 200 `text/html` with `id="root"` |
| 11 | `node scripts/verify-deployment.mjs --api http://127.0.0.1:8799 --origin https://example-vercel.test --frontend http://127.0.0.1:4173` | **0** | **7/7 checks passed** (see below) |
| 12 | Public probes of the live deployment | — | **503 on all paths** — blocked, not passed |

Check 11 detail (real CORS behaviour from the Worker, verified locally under workerd):

```
[PASS] API liveness (/healthz) — HTTP 200 {"status":"ok"}
[PASS] API readiness (/readyz) — HTTP 200 ready (d1=ok r2=ok auth=not_configured origins=ok)
[PASS] Credentialed CORS read (/api/v1/me) — HTTP 503 auth_not_configured, allow-origin=https://example-vercel.test, credentials=true
[PASS] Credentialed preflight (OPTIONS /api/v1/projects) — HTTP 204, allow-origin=https://example-vercel.test, methods=GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS
[PASS] Foreign origin refused — HTTP 403, allow-origin=absent
[PASS] Frontend serves the app — HTTP 200, content-type=text/html, root=true
[PASS] SPA deep-link fallback — HTTP 200, content-type=text/html
```

Two failures were found and fixed at their cause during this work (not by weakening checks):

1. The verifier asserted `401` for `/api/v1/me`. The API correctly answers `503
   auth_not_configured` when no OIDC client is registered — the assertion was wrong, so the check now
   accepts **401, or an explicit 503 `auth_not_configured`**, and still requires the exact
   `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials: true` either way.
2. The preview probe reported "fetch failed" because `vite preview` bound `[::1]` only while the probe
   used `127.0.0.1`. The server was restarted with `--host 127.0.0.1`; the production code was never at
   fault.

## 5. Not verified — stated plainly

- **No Vercel deployment exists.** No Vercel credentials are present in this environment
  (`VERCEL_TOKEN` unset, no `vercel` CLI login), so the project could not be created, its branch/commit
  could not be confirmed, and its real origin is unknown. Every origin in the docs is a placeholder.
- **No live frontend-to-backend call succeeded.** The only known live API returned 503 throughout.
  Connectivity, CORS and session persistence against a *deployed* pair remain unproven.
- **No browser was used.** No Playwright/Puppeteer is installed; the DOM-facing changes are covered by
  unit tests over the state machine and client, not by a rendered click-through. Layout, responsiveness
  and real chart rendering are unchecked.
- **Sign-in from a `*.vercel.app` origin cannot work** with the current host-only `__Host-` cookie. This
  is documented and surfaced in the UI, not fixed — it needs a topology decision (shared parent domain
  or same-origin proxy), not a config value.
- **Migrations `0002`/`0003` are not applied to any live database**, so even a reachable Worker would
  fail the story/projects routes on a database that only has `0001`.

## 6. Blockers and next action

1. **Owner:** create the Vercel project from this branch with the §2 settings in
   `docs/DEPLOYMENT-VERCEL.md`, set `VITE_API_BASE_URL`, and add the resulting origin to the Worker's
   `ALLOWED_ORIGINS`.
2. **Owner:** restore API reachability (the Freebuff site is paused by hosting quota monitoring) or
   deploy the owner's own Worker per `docs/DEPLOYMENT.md`.
3. **Then:** run `node scripts/verify-deployment.mjs --api <origin> --origin <vercel origin>
   --frontend <deployment URL>` and require exit 0 before calling the deployment verified.
4. **Integration:** decide how `task/TASK-01-corrective-review` and this branch combine before either
   reaches `main`.

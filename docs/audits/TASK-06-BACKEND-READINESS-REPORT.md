# TASK 06 — Backend Readiness and Frontend Integration: implementation report

**Task:** prepare Manhwa Beta for a real, functional frontend-to-backend connection.
**Branch:** `task/TASK-06-BACKEND-READINESS` (base `main` `d0eba90`)
**Date:** 25 October 2026
**Performed:** read-only probes of the two live deployments, local `wrangler dev` (workerd) with
real D1/R2 bindings, a local production build served by `vite preview`, and the repository gates.
**Not performed:** no deployment, no merge, no pull-request merge, no live D1 migration, no OIDC
registration, no production setting or secret change, no paid API call.

---

## 1. Headline

The connection is broken in **two independent places**, and both are deployment-state problems, not
missing application code:

| # | Problem | Evidence | Fix owner |
|---|---|---|---|
| 1 | The Vercel frontend was **built without `VITE_API_BASE_URL`**, so every browser API call goes to `https://manhwa-beta-frontend.vercel.app/api/*` and receives `index.html` | live bundle contains the client's `VITE_API_BASE_URL` diagnostics but **no API origin**; `GET /api/v1/me` on the frontend returns `200 text/html` | owner (Vercel env + redeploy) |
| 2 | The live Worker is a **22 October build** that predates the CORS layer and the projects/story routes | `/api/v1/projects` → `404`; `OPTIONS /api/v1/projects` → `404`; no `Access-Control-Allow-Origin` on any response; `/readyz` shape has no `origins` check and names the R2 bucket | owner (redeploy current `wrangler` build) |

Everything in the repository that the frontend needs — one typed API client, one config resolver,
CORS allow-list, readiness/health, credits, jobs, stories — exists and is exercised by tests. The
gap is that neither live artefact is currently the code in this repository.

A third limitation is architectural, not a bug: the session cookie is host-only, so a browser on
`*.vercel.app` cannot hold a session issued by `*.freebuff.page`. Sign-in from a cross-site host
therefore needs a shared parent domain or a same-origin proxy (documented since the Vercel task).

---

## 2. What was inspected (phase 1)

| Area | File(s) | State |
|---|---|---|
| Frontend API client | `src/lib/api.ts` (650 lines) | implemented, typed, reports `api_not_configured`/`unauthorized`/`network`/`timeout`/… |
| API base-URL resolution | `src/lib/apiConfig.ts` | unset → same-origin, bare origin → configured, anything else → **invalid**, never guessed |
| Workspace state machine | `src/lib/cloudWorkspace.ts` | loading / api_misconfigured / signed_out / not_configured / forbidden / error / ready (+ **unavailable**, added here) |
| Vercel config | `vercel.json` | framework vite, `bun install --frozen-lockfile`, SPA rewrite, security headers — **applied live** (headers observed) |
| Worker entry | `worker/src/index.ts` | `/healthz`, `/readyz`, `/`, `/api/v1/me`, projects, story, assets, auth |
| CORS | `worker/src/origins.ts` | exact-origin allow-list, credentials, no wildcard, preflight, mutation guard |
| Auth | `worker/src/auth.ts` | `@freebuff/auth` OIDC, cookie session, honest `auth_not_configured` |
| Bindings | `wrangler.toml` | `DB` (D1 `manhwa-studio`), `FILES` (R2 `manhwa-studio-assets`) |
| Migrations | `migrations/0001..0003` | `0001`/`0002` applied to the local D1; none applied remotely by this task |

Implementation ≠ verification, so the next section is measured, not inferred.

---

## 3. Live measurements (25 Oct 2026, ~20:31 UTC)

### 3.1 Frontend — `https://manhwa-beta-frontend.vercel.app`

```
GET /                       200 text/html (1440 bytes), x-vercel-cache: HIT
                            last-modified: Sun, 25 Oct 2026 17:51:58 GMT
                            x-frame-options: DENY, x-content-type-options: nosniff  (vercel.json applied)
                            assets/index-D0Iz_Tse.js (716,511 B), assets/index-CahEt-tp.css
GET /projects/abc/story-studio  200 text/html        (SPA fallback works)
GET /api/v1/me              200 text/html            ← the page's own HTML, not JSON
```

The served page is honest about itself (the `<meta name="description">` still says AI generation,
video rendering and YouTube publishing are "not connected in this build") — that text is static
copy from `index.html`, not a runtime probe.

Bundle inspection of `index-D0Iz_Tse.js`:

| Pattern | Count | Meaning |
|---|---|---|
| `/api/v1/…` paths | 5 distinct | the real API client is in the build |
| `VITE_API_BASE_URL` | 7 | the configuration diagnostics are compiled in |
| `api_not_configured` | 3 | the misconfiguration path exists |
| any `https://<api>` origin | **0** | **no API origin was inlined at build time** |
| `GEMINI`/`AIza`/`service_role`/`CLOUDFLARE`/tokens | 0 | no secret reached the browser |

### 3.2 Backend — `https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page`

This is the Freebuff Sites **production** environment of the `Manhwa-beta` site: `published: true`,
`deployed_at 2026-10-22T11:25:44Z`. The earlier platform pause is over — the hosting quota state
read `active` on 25 Oct 19:17 UTC.

```
GET /            200 {"service":"manhwa-studio-api","phase":"TASK-07 D1 + tenancy foundation",…}
GET /healthz     200 {"status":"ok"}
GET /readyz      200 ready  d1=ok  r2=ok  auth=ok      (no `origins` check; R2 detail names the bucket)
GET /api/v1/me   (Origin: vercel) 401 {"error":"unauthorized"}   no Access-Control-Allow-Origin
GET /api/v1/projects             404 Not Found (text/plain, 13 B)
GET /api/v1/credits              404 Not Found
OPTIONS /api/v1/projects         404 Not Found
```

Interpretation — the deployed Worker is older than the repository:

| Observation | Matches repository history |
|---|---|
| no `origins` check in `/readyz` | `worker/src/origins.ts` first appears in `fe80671` (23 Oct) |
| R2 detail `"…(bucket manhwa-studio-assets)."` | wording changed after `d990fde` (23 Oct); current code says `"R2 binding attached."` |
| `/api/v1/projects` absent | projects API added in `fe80671` (23 Oct) |
| `/api/v1/credits` absent | credits routes added in `fbd9cf9` (23 Oct) |

So `/healthz` and `/readyz` pass while nothing the frontend calls is served — the exact failure mode
a naive "the API answers 200" check hides.

### 3.3 Read-only deployment verifier, live pair

`node scripts/verify-deployment.mjs --api … --origin https://manhwa-beta-frontend.vercel.app --frontend …`
→ **exit 1, 5/9 passed**. Failures name the causes:

```
[FAIL] Credentialed CORS read (/api/v1/me)               allow-origin=absent, credentials=absent
[FAIL] Credentialed preflight (OPTIONS /api/v1/projects) 404
[FAIL] API serves the shared routes (/api/v1/projects)  404 — redeploy the current Worker
[FAIL] Frontend build targets the API origin            absent from 1 deployed bundle — built without VITE_API_BASE_URL
```

Before this task the same run produced 5/7 with two failures and no statement of *why*. Both new
checks were added because these two failures were observed here.

---

## 4. Changes made

| File | Change |
|---|---|
| `src/lib/cloudWorkspace.ts` | new terminal state `unavailable` for `network`/`timeout`; a server that *answered* with an error stays `error`. Save failures now produce `The API did not answer; nothing was saved.` |
| `src/components/CloudWorkspacePanel.tsx` | renders `unavailable` as **"Backend unavailable."** with the measured detail, an explanation of the plausible causes (undeployed/sleeping API, blocked cross-origin call, origin not allow-listed), a retry button, and the statement that browser-local projects are unaffected; the loading state now reads "Connecting to the shared API…" |
| `scripts/verify-deployment.mjs` | prints the answering service/phase; new check **6** — `GET /api/v1/projects` must answer `401` or `503 auth_not_configured` **with** the exact `Access-Control-Allow-Origin` (a `404` means a stale build); new check **9** — the deployed bundle must contain the configured API origin when the two hosts differ |
| `tests/readiness.test.ts` *(new, 14 tests)* | liveness with no bindings; readiness 503 without D1, 503 when the probe query throws, 200 only after a real query; R2/auth/origins honest states; **no secret, client id or origin value ever echoed**; credentialed CORS read, preflight, wildcard refusal, foreign-origin 403 |
| `tests/deployment-verifier.test.ts` *(new, 3 tests)* | runs the real script against two local HTTP servers: correct pair → `9/9`, exit 0; stale API (404 + no CORS) → exit 1 naming the missing routes while liveness/readiness still pass; bundle without the API origin → exit 1 naming `VITE_API_BASE_URL` |
| `tests/cloud-workspace.test.ts` | network → `unavailable`, timeout → `unavailable` (with the measured limit), 500 stays `error`, save failure message asserted |
| `docs/DEPLOYMENT-VERCEL.md`, `docs/DEPLOYMENT.md` | reconciled with the observations above (live build state, live Worker state, exact owner commands) |
| `tasks/TASK-06-BACKEND-READINESS.md`, this report, the handoff | task record |

Not changed: no Worker route, schema, auth or CORS **logic**; no dependency; `package.json` and
`bun.lock` untouched; no `VITE_` variable added; no secret written anywhere.

---

## 5. Verification performed

### 5.1 Repository gates

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `bun install --frozen-lockfile` | 0 | 126 packages, lockfile unchanged |
| 2 | `bun run lint` (`tsc --noEmit`) | 0 | clean |
| 3 | `bun test` | 0 | **294 pass / 0 fail**, 941 assertions, 20 files (was 275/18 before this task) |
| 4 | `bun run build` (no API origin) | 0 | `index.html` 1,440 B, `index-DUqTSuJe.js` 716.65 kB (gzip 204.35), `index-COZryfJx.css` 40.97 kB |
| 5 | bundle scan | — | `AIza*` 0, `service_role` 0, `GEMINI_API_KEY` 0, `SUPABASE_SERVICE_ROLE_KEY` 0, `CLOUDFLARE_API_TOKEN` 0, `FREEBUFF_CLIENT_ID` 0, UUIDs 0, bearer/ghp/xox tokens 0; the only `sk-` hits are the CSS words `mask-type` and `task-` |
| 6 | build with `VITE_API_BASE_URL=http://127.0.0.1:8799` | 0 | origin present in exactly 1 bundle file (build-time inlining confirmed) |
| 7 | rebuild without it | 0 | 0 occurrences — no stale value leaks between builds |
| 8 | `bunx wrangler deploy --dry-run --outdir /tmp/wrangler-dry` | 0 | **192.20 KiB / gzip 44.12 KiB**, `env.DB` (D1) + `env.FILES` (R2) resolve → the current Worker bundles for workerd |
| 9 | `bunx wrangler d1 migrations apply manhwa-studio --local` | 0 | `0001`, `0002` already applied; `0003` applied — 13 statements |

### 5.2 Local integration (real workerd, real bindings, production build)

`wrangler dev` on `:8799` with `APP_ORIGIN=http://127.0.0.1:8799`,
`ALLOWED_ORIGINS=http://127.0.0.1:4173`; `vite preview` of the production build on `:4173`.

```
[PASS] API liveness (/healthz)                       200 {"status":"ok"}
[PASS] API readiness (/readyz)                       200 ready (d1=ok r2=ok auth=not_configured origins=ok)
[PASS] Credentialed CORS read (/api/v1/me)            503 auth_not_configured, allow-origin=…4173, credentials=true
[PASS] Credentialed preflight (OPTIONS /api/v1/projects) 204, methods=GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS
[PASS] Foreign origin refused                         403, allow-origin=absent
[PASS] API serves the shared routes (/api/v1/projects) 503 auth_not_configured, allow-origin=…4173
[PASS] Frontend serves the app                        200 text/html, root=true
[PASS] SPA deep-link fallback                         200 text/html
[PASS] Frontend build targets the API origin          origin inlined in the deployed bundle
9/9 checks passed.  exit 0
```

This is the state a correct deployment produces: the routes exist, CORS answers the frontend
origin with credentials, a foreign origin is refused, and the frontend bundle carries the API
origin. It does **not** prove sign-in or persistence (no OIDC client exists locally).

### 5.3 Live

See §3. Read-only, `GET`/`OPTIONS` only; nothing was written to the live database.

---

## 6. Why the frontend cannot simply be "pointed at" the live API yet

Even after setting `VITE_API_BASE_URL` on Vercel, the current live Worker would still fail:

1. `/api/v1/projects` and `/api/v1/credits` do not exist there (`404`) — the workspace would show
   `Request failed (HTTP 404)`.
2. No CORS headers are emitted, so the browser would block even the routes that do exist.
3. Sign-in cannot hold a session across `*.vercel.app` ↔ `*.freebuff.page` (host-only cookie), so a
   separate-origin deployment cannot show a signed-in workspace regardless of configuration.

Ordered remediation, each an owner action (see the handoff for exact commands):

1. Redeploy the **current** Worker with `APP_ORIGIN` and `ALLOWED_ORIGINS` set; run the migration
   files on that database (authorized); re-run `verify-deployment.mjs` until `/api/v1/projects`
   answers `401`/`503 auth_not_configured` with CORS headers.
2. Set `VITE_API_BASE_URL` to that Worker origin in Vercel (Production **and** Preview) and redeploy.
3. Decide the sign-in topology (shared parent domain or same-origin proxy) before promising a
   signed-in shared workspace from Vercel.
4. Only then run the human browser pass: sign in, create one cloud project, reload, confirm it
   persists. That step alone proves persistence end to end.

---

## 7. Honest capability status after this task

| Capability | Status |
|---|---|
| Frontend renders on Vercel | **verified live** (200, assets, headers, SPA deep links) |
| Frontend knows it has no API | **verified live** — the bundle carries the diagnostic path; the live `/api/*` returns HTML, which the client converts to `api_not_configured` |
| API liveness/readiness | **verified live** (200/200) but on a **22 Oct build** |
| API routes the frontend needs | **verified live as missing** (404) → redeploy required |
| CORS for the Vercel origin | **verified live as absent** |
| CORS for a cross-origin frontend | **verified locally** under workerd (9/9) |
| Shared workspace (projects, bibles, episodes, credits) | **local only**, unauthenticated paths; authenticated flow unproven |
| Sign-in from Vercel | **blocked** by cookie topology |
| AI generation | **not verified anywhere live**; needs `GEMINI_API_KEY` + `GEMINI_MODEL`; without them the API answers `provider_not_configured` and charges nothing |
| Video rendering, YouTube publishing | **not implemented** (unchanged, by design) |

---

## 8. Residual risk

- The new bundle-origin check reads the first up-to-3 `.js` assets from `index.html`. A future
  build that splits the client into a lazily loaded chunk could place the origin in a chunk that is
  not referenced from `index.html`, producing a false failure. The check is one of nine and its
  message names the exact cause, so the cost of a false failure is a re-run, never a false pass.
- `/readyz` proves connectivity (`SELECT 1`), not that `0001`–`0003` are present. A current Worker
  deployed against a `0001`-only database would report `ready` and then fail the newer routes. A
  schema probe was considered and deliberately **not** added here because no observation in this
  task demonstrated it; it is the recommended next hardening step (see the handoff).

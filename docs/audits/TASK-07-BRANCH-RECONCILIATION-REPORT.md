# TASK 07 — Branch Reconciliation and Live Backend Deployment Readiness: report

**Branch:** `task/TASK-07-BRANCH-RECONCILIATION` (base `main` = `d0eba90`)
**Date:** 25 October 2026
**Performed:** ref verification by ancestry, reconciliation from `main`, repository gates,
`wrangler deploy --dry-run`, a local workerd API (real D1/R2 bindings) with a production frontend
build, the deployment verifier, and bundle scanning.
**Not performed:** no merge, no deployment, no live migration, no OIDC registration, no production
setting or secret change, no paid API call.

---

## 1. The briefing's premise was already stale — here is the measured state

The task says `main` "has not yet received the integrated backend implementation". It has. Verified
by ancestry, not by inference:

| Ref | SHA | Relationship to `main` |
|---|---|---|
| `main` (remote and local agree) | `d0eba90` | — |
| `task/VERCEL-DEPLOYMENT-READINESS` | `f0d3503` | **ancestor of `main`** (0 unique commits) |
| `task/TASK-05-END-TO-END-READINESS` (remote) | `4993643` | **ancestor of `main`**; its own tip `a8b65bf` is also an ancestor (merged at `9c04cf5`) |
| `task/TASK-01-corrective-review` (= PR #4 head) | `0ed6b08` | **diverged**: 9 commits ahead, 45 behind, merge base `49ed52c` |
| `task/TASK-IMPLEMENT-SHARED-FOUNDATION` | `2bbd155` | ancestor |
| `task/TASK-04-PERSISTENT-STORY-GENERATION` | `1f9d2a6` | ancestor |
| `task/TASK-03-AUTH-TENANT-HARDENING` | `3e26b77` | ancestor |

```
49ed52c ──┬── TASK-05 line (… a8b65bf) ── VERCEL (… f0d3503) ──┐
          │                                                     ├── main d0eba90
          └── TASK-01-corrective-review 0ed6b08 (9 commits) ─────┘   ← never merged
```

Two corrections to the briefing, recorded because a report that repeats a false premise is worse
than no report:

1. **`f0d3503` is in `main`** (`de851eb`/`f0d3503` are on `main`'s first-parent line), so the Vercel
   configuration did not need re-incorporating.
2. **`task/TASK-05-END-TO-END-READINESS` on the remote now points at `4993643`**, a consolidation
   commit on `main`'s line, not at its own task tip `a8b65bf`. Both are ancestors of `main`; the
   earlier TASK-05 handoff describes `a8b65bf` and remains accurate about the *content*.

So the only genuinely unreconciled work is **TASK-01's 9 commits**, and `main` is already a coherent
integrated application. That is what this branch reconciles.

---

## 2. What TASK-01 actually contains (measured, not assumed)

`git diff origin/main...0ed6b08` — TASK-01's own work relative to the merge base — is 19 files:

| Area | Files | Status on `main` before this branch |
|---|---|---|
| Storage safeguards | `src/lib/storage.ts`, `src/App.tsx` | **already present, byte-identical behaviour** (`PROJECTS_STORAGE_KEY`, `LEGACY_PROVIDER_KEY` purge, `sanitizeStoredProjects`) |
| UI honesty copy | `GettingStartedModal.tsx` | **already present** (demo generator + "YouTube not connected") |
| Sample data | `src/data/mockProjects.ts` | upload state already `not_uploaded`; **one fabricated note remained** |
| Page metadata | `index.html`, `metadata.json` | **not applied**: title claimed "AI Webtoon Production"; `metadata.json` claimed "secure YouTube publishing" and `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` |
| Tests | `tests/task01-honesty.test.ts`, `task01-render.test.tsx`, `task01-interaction.test.tsx`, `task01-forms.test.tsx`, `tests/setup/dom.ts` | **absent**: 42 tests of rendered/labelled UI, storage sanitation and form behaviour |
| Harness | `bunfig.toml` (`preload = ["./tests/setup/dom.ts"]`) | **deliberately not imported** — see §3 |
| Dev deps | `@happy-dom/global-registrator`, `@testing-library/dom`, `@testing-library/react` | needed for the tests; added here |
| Docs | TASK-01 report/handoff updates, `docs/pr/TASK-01-CORRECTIVE-PR.md` | superseded by this repository's current records; not imported |

The earlier consolidation already rejected a wholesale merge of TASK-01 because it regressed the app
(11 failures; 58 Worker tests broken by the global DOM preload). This task fixes both causes instead
of repeating that outcome.

---

## 3. Conflicts, and how each was resolved

| Conflict | Choice | Why |
|---|---|---|
| **Global DOM preload vs Worker tests.** TASK-01's `bunfig.toml` registers happy-dom for the *whole* run, replacing `Request`/`Response`/`Headers`/`fetch`; 27–58 Worker route tests then fail (`app.request` through Hono). Reproduced here: leaving the DOM registered → **27 failures**, including tenancy, CORS, assets and credits. | `bunfig.toml` **not** imported. `tests/setup/dom.ts` registers on import of a DOM test file and unregisters in `afterAll`; `package.json` test script is now `bun test --isolate`, so each file gets a fresh global object. | Isolation is what makes both suites honest in one run. With `--isolate`: **317 pass / 0 fail**, no "unhandled error between tests". |
| **`screen` binds at import time.** `@testing-library/dom` binds `screen` to `document.body` when the module is evaluated, so a static import hoisted above registration yields a permanently-throwing stub. | `tests/setup/dom.ts` imports `@testing-library/react` with a top-level `await import(...)` **after** registration, and re-exports `render`/`screen`/`fireEvent`/`waitFor`/`cleanup`. | The tests use the library's real bindings; nothing is stubbed away. |
| **React scheduler firing after teardown** → `ReferenceError: window is not defined` between tests. | `afterAll` awaits `drainReactWork()` (a macrotask) after `cleanup()`, then unregisters. | Removes the error without hiding it behind a global that stays registered. |
| **`index.html` title.** TASK-01 renamed the page "Demo Webtoon Script Studio"; `main`'s newer description ("… AI generation, video rendering, and YouTube publishing are not connected in this build") is more accurate for an app that now has a shared cloud workspace. | Keep `main`'s description and `og:description`; change only the title/`og:title` to **"Manhwa Studio — Webtoon Script & Story Studio"**. | Removes the "AI Webtoon Production" claim without downgrading the app to a demo that it no longer is. |
| **`metadata.json`.** Claimed "secure YouTube publishing" and a server-side Gemini capability. | Imported TASK-01's `majorCapabilities: []` and replaced the description with accurate copy (no `AI-powered`, no publishing claim). | The *web app* calls no model; the Worker does, separately. The metadata describes the web app. |
| **Sample approval note** "Action pacing is excellent. Approved for storyboard asset rendering." | Replaced with an explicit demo note (TASK-01's wording). | Nothing renders storyboard assets; the sentence claimed a pipeline that does not exist. |
| **Duplicate code** (storage, App wiring, modal copy, upload state) | Not re-imported. | Already on `main`; re-applying would be churn with conflict risk. |

Nothing was resolved by weakening an assertion: every imported test passes on its original terms
except the title assertion, which is satisfied by fixing the page instead.

---

## 4. Changes on this branch

| File | Change |
|---|---|
| `tests/task01-honesty.test.ts` *(new, 11 tests)* | static honesty guards: single storage key, legacy key never read, sanitizer behaviour, sample data, metadata, demo generator, analytics copy, no provider key literals |
| `tests/task01-render.test.tsx` *(new, 5 tests)* | server-rendered markup of the demo generator, analytics and approval center |
| `tests/task01-interaction.test.tsx` *(new, 11 tests)* | real DOM: demo sample only after a click, never persisted; legacy-key purge; fabricated-video cleanup; hub/workspace/tabs/analytics/approval navigation |
| `tests/task01-forms.test.tsx` *(new, 15 tests)* | Story Bible field-level state, project creation, deletion safeguards, empty/boundary inputs |
| `tests/setup/dom.ts` *(new)* | scoped happy-dom harness + deterministic API stub (401) for the workspace panel |
| `package.json` / `bun.lock` | `test` → `bun test --isolate`; dev deps `@happy-dom/global-registrator`, `@testing-library/dom`, `@testing-library/react` |
| `index.html` | title/`og:title` no longer claim a working AI pipeline |
| `metadata.json` | accurate description, no publishing/Gemini capability claim |
| `src/data/mockProjects.ts` | demo note instead of a fabricated rendering approval |
| task file, this report, handoff | records |

Not changed: Worker routes, schema, auth, CORS, credits, jobs, API client, workspace panel,
`vercel.json`, `apiConfig.ts`, migrations. No dependency upgrade; existing pins untouched.

---

## 5. Verification performed

### 5.1 Gates

| Command | Exit | Result |
|---|---|---|
| `bun install --frozen-lockfile` | 0 | 148 installs across 267 packages, no changes |
| `bunx tsc --noEmit` | 0 | clean (after fixing one `as typeof fetch` cast the new harness needed) |
| `bun run lint` | 0 | clean |
| `bun run test` (`bun test --isolate`) | 0 | **317 pass / 0 fail, 22 files**, ~3.9 s (main's recorded baseline: 275 / 18) |
| `bun run build` | 0 | `dist/index.html` 1,463 B, `index-Dn0IK5ue.js` 715.09 kB (gzip 204.04), `index-D_FtDv46.css` 41.20 kB |
| bundle scan | — | `AIza*` 0, `service_role` 0, `GEMINI_API_KEY` 0, `SUPABASE_SERVICE_ROLE_KEY` 0, `CLOUDFLARE_API_TOKEN` 0, `FREEBUFF_CLIENT_ID` 0, `workers.dev` 0, `freebuff.page` 0, `vercel.app` 0, `ghp_` 0, `Bearer ` 0 |
| build with `VITE_API_BASE_URL=http://127.0.0.1:8799` | 0 | origin inlined in exactly 1 bundle file |
| rebuild without it | 0 | 0 occurrences — no stale value leaks between builds |
| `bunx wrangler deploy --dry-run` | 0 | 192.20 KiB (gzip 44.12), `env.DB` + `env.FILES` resolve |

`--isolate` is a deliberate, documented change: it is what lets the DOM suite and the Worker suite
share one `bun test` invocation without either being polluted.

### 5.2 Local Worker integration (workerd, real D1/R2 bindings, production build)

`wrangler dev :8799` with `APP_ORIGIN=http://127.0.0.1:8799`, `ALLOWED_ORIGINS=http://127.0.0.1:4173`;
`vite preview` of the production build on `:4173`.

| Check | Observed |
|---|---|
| `GET /healthz` | 200 `{"status":"ok"}` |
| `GET /readyz` | 200 `ready` — `d1: ok` (real `SELECT 1`), `r2: ok`, `auth: not_configured`, `origins: ok` (2 exact origins, values not disclosed) |
| `GET /api/v1/me` + Origin | 503 `auth_not_configured`, `Access-Control-Allow-Origin: http://127.0.0.1:4173`, `Allow-Credentials: true`, `Vary: Origin`, `Cache-Control: private, no-store` |
| `GET /api/v1/projects` + Origin | 503 `auth_not_configured`, same CORS headers |
| `GET /api/v1/nope` | 404 `text/plain` **with** CORS headers (Hono default 404) |
| `OPTIONS /api/v1/projects` from a foreign origin | 403, no `Access-Control-Allow-Origin` |
| Deployment verifier | **7/7 checks passed, exit 0** |

Note: this branch carries `main`'s verifier (7 checks). The two extra checks (route existence, bundle
API origin) live on the separate `task/TASK-06-BACKEND-READINESS` branch, which touches no file this
branch changes.

### 5.3 Not counted as integration tests

The 317 passing tests are unit/route/DOM tests. They run against real SQLite migrations and real
Hono routes, but no request left this machine, no session existed, and no generation ran. Live
behaviour is only what §6 states.

---

## 6. Production readiness audit

| Component | Status | Evidence |
|---|---|---|
| **Cloudflare Worker (this repo's build)** | **D — blocked on owner action** | never deployed; `wrangler deploy --dry-run` only. The live Freebuff Sites worker is an **older build** (deployed 22 Oct) that serves `/healthz`+`/readyz` but `404`s `/api/v1/projects` and `/api/v1/credits` and emits no CORS headers (measured 25 Oct, TASK-06 report §3) |
| **D1 database + migrations** | **B locally / D live** | `0001`–`0003` apply cleanly locally (`wrangler d1 migrations apply --local`: 13 statements for `0003`); `/readyz` proves `SELECT 1` against the live database but **the live schema version is unknown** and `0002`/`0003` are unapplied to any live database |
| **R2 bucket + binding** | **D — blocked** | binding resolves in the dry-run bundle and reports `r2: ok` on a local/dev binding and on the live stale worker; no live object write was attempted (it would be a mutation), so round-trip storage is unproven live |
| **Freebuff/OIDC client** | **C for this Worker / live client belongs to another deployment** | no client registered for the owner's Worker (local `/readyz` says `auth: not_configured`, `/api/v1/me` → 503). The Freebuff-hosted site has its own client (`auth: ok`, `/api/v1/me` → 401) that cannot be reused |
| **`ALLOWED_ORIGINS`** | **C — not configured live** | absent on the live worker (no `Access-Control-Allow-Origin` on any response); verified working locally with two exact origins and a 403 for a foreign preflight |
| **Vercel project + env** | **A for hosting, C for configuration** | `https://manhwa-beta-frontend.vercel.app` is live (200, SPA fallback, security headers) but was built **without `VITE_API_BASE_URL`** (no API origin in the bundle), so it cannot reach any API |
| **AI provider credentials/model** | **C — not configured** | `GEMINI_API_KEY`/`GEMINI_MODEL` unset here (no local env file exists); with neither, generation answers `provider_not_configured` and charges nothing (covered by `tests/ai-provider.test.ts`); no live generation has ever been observed |

---

## 7. Residual risk

- `bun test --isolate` gives each file a fresh global object, which is slower and changes the
  process model from the previous default. Measured cost: ~3.9 s for the whole suite, acceptable, but
  it is a behaviour change any future test author should know about.
- The DOM harness stubs `fetch` with an immediate 401 for the whole file. A future test that wants to
  exercise the workspace panel with a real response must stub per test rather than rely on this.
- The imported tests read source text in a few places (`task01-honesty.test.ts`). That is intentional
  for honesty guards, but it makes them sensitive to harmless copy refactors; a failure there means
  "re-read the copy", not necessarily "the app broke".
- `metadata.json` now declares no major capabilities. If the app is ever re-imported into AI Studio
  expecting a server-side Gemini capability, that flag must be re-added deliberately — the *web app*
  still does not call a model.

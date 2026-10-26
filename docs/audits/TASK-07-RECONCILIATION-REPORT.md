# TASK 07 — Branch reconciliation: measured report

**Branch:** `task/TASK-07-RECONCILE-INTEGRATION`
**Base:** `main` = `d0eba90fec746ec447e784072584acdd9ee3d49a`
**Date:** 26 October 2026
**Performed:** ref verification by ancestry, reconciliation from `main`, all repository gates, a
local Workerd Worker with real local D1/R2, the deployment verifier, bundle scanning, and a
build-time configuration check.
**Not performed:** no merge, no PR merge, no deployment, no remote migration, no OIDC registration,
no production setting or secret change, no paid API call.

---

## 1. The briefing was stale in both directions

The task said `main` was `49ed52c9` and that four branches diverge. Measured:

| Ref | SHA | Relation to `main` |
|---|---|---|
| `main` (remote and local agree) | `d0eba90` | — |
| `task/VERCEL-DEPLOYMENT-READINESS` | `f0d3503` | **ancestor** — the Vercel work is already in `main` |
| `task/TASK-05-END-TO-END-READINESS` | `a8b65bf` | **ancestor** (merged at `9c04cf5`) |
| `task/TASK-05-END-TO-END-READINESS` (remote ref) | `4993643` | **ancestor** — a consolidation commit on `main`'s line |
| `task/TASK-IMPLEMENT-SHARED-FOUNDATION` | `2bbd155` | ancestor |
| `task/TASK-03-AUTH-TENANT-HARDENING` | `3e26b77` | ancestor |
| `task/TASK-04-PERSISTENT-STORY-GENERATION` | `1f9d2a6` | ancestor |
| `task/TASK-07-d1-tenancy-foundation` | `8d74d67` | ancestor |
| `task/TASK-01-reconcile-ci`, `TASK-02-verify-stabilization` | `905bf57`, `a15c99a` | ancestor |
| **`task/TASK-01-corrective-review`** (= PR #4 head) | `0ed6b08` | **diverged: 9 ahead, 45 behind** (merge base `49ed52c`) |
| `task/TASK-06-BACKEND-READINESS` | `053611e` | 2 ahead, 0 behind — unmerged sibling, out of scope |
| `task/TASK-07-BRANCH-RECONCILIATION` | `cf29de0` | 2 ahead, 0 behind — abandoned sibling (its worktree is a stale registration) |
| `plan/manhwa-studio-15-task-roadmap` | `bd2fb20` | 16 ahead, 46 behind — planning docs only |

```
49ed52c ──┬── TASK-05 line (… a8b65bf) ── VERCEL (… f0d3503) ──┐
          │                                                     ├── main d0eba90
          └── TASK-01-corrective-review 0ed6b08 (9 commits) ────┘   ← never merged
```

Two corrections to the brief, recorded because repeating a false premise is worse than no report:

1. **The integrated stack and the Vercel configuration are already on `main`.** There was nothing
   to re-integrate there; a new branch that "added" them would have been duplicate work.
2. **`main` moved** from `49ed52c9` to `d0eba90` before this task started. Every claim below is
   against `d0eba90`.

So exactly one branch is genuinely unreconciled: **TASK-01**.

## 2. What TASK-01 still contributes

TASK-01 merged wholesale into `main` is destructive (18,258 deletions — it predates the Worker, the
API client and the shared workspace). Its content splits cleanly:

| Area | Status on `main` before this branch |
|---|---|
| `src/lib/storage.ts` (`PROJECTS_STORAGE_KEY`, `LEGACY_PROVIDER_KEY`, `sanitizeStoredProjects`) | **already present**, same behaviour |
| `src/App.tsx` legacy-key purge + sanitized load | **already present** (main's version also wraps persistence in `try`/`catch`) |
| `GettingStartedModal` honest demo/YouTube copy | **already present** in main's own newer wording |
| Approval upload state in sample data | already `not_uploaded`; **one fabricated note remained** |
| `index.html` / `metadata.json` claims | **missing**: title claimed "AI Webtoon Production"; metadata claimed "secure YouTube publishing" + a server-side Gemini capability |
| UI test suite (4 files + `tests/setup/dom.ts`) | **missing** — no component/DOM tests existed at all |
| Dev deps for DOM tests | **missing** |

## 3. Integration decisions

| Conflict | Decision | Why |
|---|---|---|
| TASK-01's `bunfig.toml` (`preload = ["./tests/setup/dom.ts"]`) | **Not imported.** `tests/setup/dom.ts` registers happy-dom on import from a DOM test file and unregisters in `afterAll`; `package.json` test script is `bun test --isolate`. | A global preload replaces `Request`/`Response`/`Headers`/`fetch` for the entire run. The Worker route tests drive Hono through `app.request` and need those real Web APIs. Isolation is what lets both suites be honest in one run. |
| `@testing-library/dom` binds `screen` to `document.body` at import time | `dom.ts` imports `@testing-library/react` with a top-level `await import(...)` **after** registration, then re-exports `render`/`screen`/`fireEvent`/`waitFor`/`cleanup`/`drainReactWork`. | A static import hoisted above registration yields a permanently-throwing stub; this uses the real bindings instead of stubbing the library away. |
| React scheduler firing after teardown (`ReferenceError: window is not defined`) | `afterAll` awaits `drainReactWork()` then unregisters. | Removes the cross-test error without leaving a global registered. |
| `index.html` title | Keep `main`'s accurate description; change title/`og:title` to **"Manhwa Studio — Webtoon Script & Story Studio"**. | Drops the "AI Webtoon Production" claim without downgrading an app that now has a shared cloud workspace. |
| `metadata.json` | TASK-01's `majorCapabilities: []` and a description that claims neither AI generation nor publishing. | The web app calls no model; the Worker does, separately. |
| Sample approval note ("Approved for storyboard asset rendering.") | Replaced with an explicit demo note. | Nothing renders storyboard assets; the sentence claimed a pipeline that does not exist. |
| TASK-01 docs (`docs/audits/TASK-01-*`, `docs/pr/*`) | Not imported. | TASK-07 records supersede them; TASK-01's report describes a branch that is 45 commits behind. |
| `task/TASK-06-BACKEND-READINESS` and `task/TASK-07-BRANCH-RECONCILIATION` | **Not integrated.** | Both are unmerged sibling work with their own pending review. Folding another task's unreviewed commits into a reconciliation branch would hide that decision instead of surfacing it. |

No assertion was weakened to make a test pass. The one imported test that would have failed — the
page-title claim — passes because the page was fixed.

## 4. Changes on this branch

| File | Change |
|---|---|
| `tests/task01-honesty.test.ts` *(new)* | 11 static guards: single storage key, legacy key never read, sanitizer behaviour, sample data, metadata, demo generator, analytics copy |
| `tests/task01-render.test.tsx` *(new)* | Render-level guards: required honest labels present, banned claims absent |
| `tests/task01-interaction.test.tsx` *(new)* | Real DOM interaction: modals, tabs, navigation, state transitions |
| `tests/task01-forms.test.tsx` *(new)* | Field-level editor validation, project creation, deletion confirmation, empty/invalid/boundary input |
| `tests/setup/dom.ts` *(new)* | Scoped happy-dom harness + API 401 stub + teardown helpers |
| `package.json` | `test` → `bun test --isolate`; add `@happy-dom/global-registrator`, `@testing-library/dom`, `@testing-library/react` |
| `bun.lock` | Lockfile for those three dev dependencies |
| `index.html` | Title/`og:title` no longer claim AI production |
| `metadata.json` | Accurate description; `majorCapabilities: []` |
| `src/data/mockProjects.ts` | Sample approval note states it is a demo record |

`vercel.json`, `src/lib/api.ts`, `src/lib/apiConfig.ts`, `src/lib/cloudWorkspace.ts`,
`src/components/CloudWorkspacePanel.tsx`, `worker/**` and `migrations/**` are **unchanged** — `main`
already carries them.

**Regression risk:** dev-only dependencies plus test files; no runtime module changed apart from one
sample-data string and two page-metadata strings.

## 5. Verification (all local; nothing deployed)

| Check | Command | Exit | Result |
|---|---|---|---|
| Frozen install | `bun install --frozen-lockfile` | 0 | 148 packages, no lockfile change |
| Types | `bunx tsc --noEmit` | 0 | clean |
| Lint | `bun run lint` | 0 | clean |
| Tests | `bun run test` | 0 | **317 pass / 0 fail**, 1068 `expect()` calls, 22 files |
| Build | `bun run build` | 0 | `index.html` 1.43 kB, CSS 41.20 kB, JS 715.09 kB (gzip 204.04 kB) |

Test-suite composition matters here: the Worker/DOM interaction is the whole risk of this branch.
With the DOM harness scoped and `--isolate`, all 22 files pass in one run — including the Worker
route suites (`projects`, `asset`, `tenancy`, `origins`, `auth-hardening`, `replication`,
`story-generation`) that a global preload breaks.

### Worker runtime, local Workerd with real local D1 + R2

`wrangler d1 migrations apply --local` applied `0001`, `0002_assets_and_replication`, `0003` to a
disposable local database; the Worker then ran on `127.0.0.1:8787` with local `DB`/`FILES` bindings.

| Probe | Observed |
|---|---|
| `GET /healthz` | `200 {"status":"ok"}` |
| `GET /readyz` | `200 ready` — `d1=ok` (real `SELECT 1`), `r2=ok`, `auth=not_configured` |
| `OPTIONS /api/v1/projects` from a configured origin | `204`, exact `Access-Control-Allow-Origin` echoed, `Access-Control-Allow-Credentials: true`, `Vary: Origin` |
| `GET /api/v1/projects` from a configured origin, no session | `503 auth_not_configured`, `Cache-Control: private, no-store`, CORS matched |
| `GET /api/v1/me` from a configured origin | `503 auth_not_configured` (no OIDC client), CORS matched |
| `OPTIONS` from an unlisted origin | `403 Origin not allowed`, no `Allow-Origin` |
| `GET` from an unlisted origin | `503`, **no `Allow-Origin`** — the browser cannot read it |

### Deployment verifier

`node scripts/verify-deployment.mjs --api http://127.0.0.1:8787 --origin http://localhost:3000
--frontend http://127.0.0.1:4173` → **exit 0, 7/7 passed**: liveness, readiness, credentialed CORS
read, credentialed preflight, foreign-origin refusal, SPA served, SPA deep-link fallback.
Without `--frontend`, the five API checks pass (5/5).

The SPA checks ran against `vite preview` serving the production `dist/`. That proves the built
bundle and its SPA fallback work; it does **not** prove Vercel's own `rewrites` config, which can
only be confirmed on a real Vercel deployment.

### Bundle and configuration

- `VITE_API_BASE_URL` is a genuine build-time input: set it → the origin appears in exactly **one**
  bundle file, once; unset → **0** occurrences. A missing origin therefore cannot silently point at
  a stale API.
- Credential scan of `dist/` (`AIza…`, `sk-…`, `service_role`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GEMINI_API_KEY`, `CLOUDFLARE_API_TOKEN`, `freebuff.page`, `workers.dev`, `.vercel.app`): the only
  match is the literal string `manhwa_gemini_key`, which is the **name** of the legacy localStorage
  key the app purges. No credential, token or deployment origin is in the bundle.
- Build emits a >500 kB chunk advisory for the single JS bundle. It is a warning, not a failure;
  code-splitting was not added because it is unrelated to this task.

## 6. Limitations — what is still not verified

1. **No live backend.** The previously documented API host answered `503 Site temporarily
   unavailable` on `/`, `/healthz`, `/readyz` and `/api/v1/me`, and the Sites record reports hosting
   usage "being checked… Sites will resume when monitoring is available" — a platform-side pause.
   Live connectivity, live CORS and live session persistence remain unproven.
2. **No browser automation** in this environment. Rendered layout, responsiveness, chart rendering
   and real sign-in are unverified; the DOM tests assert structure and labels, not pixels.
3. **No Vercel project exists.** No Vercel credentials are available, so the deployment origin, the
   branch Vercel builds from, and Vercel's actual rewrite behaviour are unknown. Every origin in the
   docs is a placeholder.
4. **No OIDC client is registered**, so `auth_not_configured` is the correct observed response and
   sign-in cannot be exercised.
5. **Migrations `0002`/`0003` have not been applied to any live database**; only a disposable local
   one.

## 7. Untracked file left in place

`migrations/0002_assets.sql` is an untracked, older duplicate of the tracked
`migrations/0002_assets_and_replication.sql` (its `assets` table was superseded there). It is not
committed, but `wrangler d1 migrations apply` reads every `*.sql` in that directory, so a local
apply fails while it exists. It was moved aside for the local run and restored afterwards. An
operator should delete it:

```bash
rm migrations/0002_assets.sql
```

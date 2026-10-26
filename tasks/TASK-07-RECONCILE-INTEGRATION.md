# TASK 07 — Reconcile Manhwa Beta branches

**Branch:** `task/TASK-07-RECONCILE-INTEGRATION`
**Base:** `main` = `d0eba90`
**Status:** complete on this branch; awaiting review and the owner's merge decision.

## Objective

One coherent, tested branch containing the real application, its Cloudflare Worker backend, and the
Vercel deployment configuration — with existing branches left untouched.

## What the briefing assumed

- `main` = `49ed52c9`
- `task/TASK-01-corrective-review` = `0ed6b08`
- `task/TASK-05-END-TO-END-READINESS` = the integrated stack
- `task/VERCEL-DEPLOYMENT-READINESS` = `f0d3503`
- "These branches diverge."

## What is actually true (verified, see the audit report)

`main` had already advanced to `d0eba90` and already contained the Worker, the API client, the
`CloudWorkspacePanel`, and the whole Vercel configuration (`de851eb`, `f0d3503` are ancestors of
`main`). Of the ~25 refs in the repository, **only `task/TASK-01-corrective-review` is genuinely
unreconciled**; everything else is an ancestor of `main` or an unmerged sibling task branch.

TASK-01 is 9 commits ahead and **45 behind** `main`, so merging it wholesale would delete the
Worker and the shared workspace (18,258 deletions). Its *runtime* fixes are already on `main`; what
was missing was its UI test suite and three stale public claims.

## Completed

- [x] Verified every ref by ancestry rather than by SHA claim.
- [x] Created a new branch from current `main`; `main` untouched, nothing force-pushed.
- [x] Integrated TASK-01's 5 test files + scoped DOM harness + 3 claim fixes onto `main`'s newer code.
- [x] Rejected TASK-01's global `bunfig.toml` preload, which replaces `Request`/`Response`/`Headers`/
      `fetch` for the whole run and breaks the Worker route tests.
- [x] `bun install --frozen-lockfile`, `bunx tsc --noEmit`, `bun run lint`, `bun run test`,
      `bun run build` — all exit 0; 317 tests pass.
- [x] Ran the deployment verifier against a local Workerd Worker with real local D1/R2 (7/7).
- [x] Verified Worker health, readiness, CORS and `auth_not_configured` behaviour by probe.
- [x] Scanned the production bundle for credentials and hardcoded origins.
- [x] Confirmed `VITE_API_BASE_URL` is a real build-time input (present in the bundle only when set).
- [x] Wrote the audit report and handoff for the next owner.

## Not done, deliberately

- No merge into `main`, no PR merge, no deploy, no production migration, no OIDC client
  registration, no production setting or secret change, no paid API call.
- `task/TASK-06-BACKEND-READINESS` (2 commits ahead of `main`) was **not** integrated: it is a
  parallel task branch with its own pending review, not part of this task's scope.
- TASK-01's own documentation was not imported; TASK-07 records supersede it.

# TASK 07 — Branch Reconciliation and Live Backend Deployment Readiness

Scope:
- Verify the real state of `main`, `task/TASK-05-END-TO-END-READINESS`,
  `task/VERCEL-DEPLOYMENT-READINESS` and `task/TASK-01-corrective-review` before trusting any
  earlier report.
- Produce one coherent branch from the current `main` that carries the integrated Worker, D1/R2
  bindings, authentication, API client and cloud workspace, the Vercel deployment configuration, and
  the tests that still apply.
- Preserve the parts of TASK-01 that are genuinely useful, without importing its stale duplicate
  edits or its suite-breaking global preload.
- Prove the result locally: gates, a real workerd API, the deployment verifier, bundle scanning.
- Report production readiness honestly as verified-live / local-only / not-configured / owner-blocked.
- Do **not** merge, deploy, apply live migrations, register OIDC clients, change production settings
  or spend credits.

Branch: `task/TASK-07-BRANCH-RECONCILIATION`
Base: `main` = `d0eba90`

## Acceptance criteria

- [x] Remote refs fetched; the SHA of every named branch recorded and checked by ancestry, not assumption.
- [x] Commit graph and exact per-branch differences calculated (unique commits, merge base, files).
- [x] Prior reports re-verified; the stale claims in this task's own briefing corrected in writing.
- [x] Branch created from current `main`; nothing overwritten, no branch rewritten, no force-push.
- [x] All still-missing TASK-01 work identified by diff and by running its tests, then imported deliberately.
- [x] TASK-01's suite-breaking global preload replaced with a scoped DOM harness plus `bun test --isolate`.
- [x] Duplicate/superseded TASK-01 edits excluded, with the reason recorded.
- [x] Gates run: `bun install --frozen-lockfile`, `bunx tsc --noEmit`, `bun run lint`, `bun run test`, `bun run build`.
- [x] Frontend bundle scanned for secrets and for stray API origins.
- [x] Worker exercised locally for liveness, readiness, D1, R2, auth-not-configured, CORS and error handling.
- [x] Deployment verifier run against a local workerd API and a real production build.
- [x] `wrangler deploy --dry-run` proves the Worker still bundles for workerd with its bindings.
- [x] Production readiness audited per component and stated with its evidence level.
- [x] Task file, audit report and handoff written; branch pushed; pull-request link reported.
- [x] No merge, no deployment, no migration, no credential or production setting change.

## Required configuration (names only, for the deployment step)

Frontend build (Vercel, public): `VITE_API_BASE_URL`
Worker public config: `APP_ORIGIN`, `ALLOWED_ORIGINS`, `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`
Worker secrets: `GEMINI_API_KEY`, `GEMINI_MODEL`, optional `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
Bindings already declared: `DB` (D1 `manhwa-studio`), `FILES` (R2 `manhwa-studio-assets`)

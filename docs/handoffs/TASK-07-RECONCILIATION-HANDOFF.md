# TASK 07 — Reconciliation handoff

**Branch:** `task/TASK-07-RECONCILE-INTEGRATION`
**Base:** `main` = `d0eba90` (do not assume this is still current — re-verify before acting)
**Code commit:** `3423a20` (tests, DOM harness, metadata/claims)
**Records commit:** the tip of this branch (`git log -1 --format=%h`)
**Date:** 26 October 2026

## State in one paragraph

`main` was already a coherent integrated application: Worker API, D1/R2 bindings, auth layer, typed
API client, `CloudWorkspacePanel`, and the full Vercel configuration (`vercel.json`, `apiConfig`,
deployment guide, verifier, deployment tests) were all present, because
`task/VERCEL-DEPLOYMENT-READINESS` and `task/TASK-05-END-TO-END-READINESS` are ancestors of `main`.
The only genuinely unreconciled branch was `task/TASK-01-corrective-review` (9 ahead / 45 behind),
whose runtime fixes were already on `main`. This branch reconciles what remained: TASK-01's UI test
suite, its scoped DOM harness, and three stale public claims. It changes no runtime module except
one sample-data string and two page-metadata strings.

## What was verified (local only)

- `bun install --frozen-lockfile`, `bunx tsc --noEmit`, `bun run lint`, `bun run build` — all exit 0.
- `bun run test` — **317 pass / 0 fail**, 22 files, 1068 assertions.
- Worker on local Workerd with disposable local D1 + R2: `/healthz` 200, `/readyz` ready
  (real `SELECT 1`), credentialed CORS preflight 204 with exact origin, unlisted origin 403 with no
  `Allow-Origin`, protected routes `503 auth_not_configured` with `private, no-store`.
- `scripts/verify-deployment.mjs` — **7/7** (5 API + 2 SPA) against local Worker + `vite preview`.
- `VITE_API_BASE_URL` is real build-time config: in the bundle only when set (1 occurrence), 0 when
  unset.
- Bundle credential scan clean (only the `manhwa_gemini_key` key *name* used for the purge).

## Not verified — do not claim otherwise

- Live API: the documented host answered `503 Site temporarily unavailable`; hosting is paused.
- Real browser: no automation available; layout, responsiveness and charts unverified.
- Vercel: no project exists, no credentials here; the deployment origin and Vercel's own rewrite
  behaviour are unknown.
- Sign-in: no OIDC client registered, so `auth_not_configured` is correct and untestable beyond that.
- No migration has been applied to a live database.

## Next owner actions, in order

1. **Re-verify the base.** `git fetch && git log -1 --oneline origin/main`. If `main` moved, rebase
   or re-cut this branch rather than merging blind.
2. **Review and merge this branch** once the checks below pass on CI or locally. It is additive and
   dev-only except for metadata/sample strings, so it is safe to merge independently of any
   deployment work.
3. **Decide the two unmerged siblings** — they are *not* redundant with this branch:
   - `task/TASK-06-BACKEND-READINESS` (`053611e`, 2 ahead): "backend unavailable" state, verifier
     bundle-origin check, readiness/deployment-verifier tests.
   - `task/TASK-07-BRANCH-RECONCILIATION` (`cf29de0`, 2 ahead): an earlier, abandoned attempt at
     this same reconciliation, superseded here. Prefer this branch; keep or delete that one
     deliberately.
4. **Delete the stray migration** before any local migration apply:
   `rm migrations/0002_assets.sql` (untracked, older duplicate of the tracked `0002_assets_and_replication.sql`).
5. **Only with owner authorization:** resume hosting, deploy the Worker, apply `0002`/`0003` to the
   live database, register the OIDC client, then create the Vercel project with
   `VITE_API_BASE_URL=https://<API origin>` for Production **and** Preview, and add that exact
   origin to the Worker's `ALLOWED_ORIGINS`.
6. **Verify the deployment** with
   `node scripts/verify-deployment.mjs --api <origin> --origin <vercel origin> --frontend <url>`
   and require exit 0 before telling anyone it works.

## Exact commands

```bash
git fetch origin
git log -1 --oneline origin/main                  # confirm the base first
git log --oneline origin/main..HEAD               # what this branch adds

bun install --frozen-lockfile
bunx tsc --noEmit
bun run lint
bun run test
bun run build
```

## Explicitly not done (and must stay that way without new authorization)

No merge, no PR merge, no deploy, no remote migration, no OIDC registration, no production setting
or secret change, no paid API call, no force-push, and no modification of `main` or of any existing
task branch.

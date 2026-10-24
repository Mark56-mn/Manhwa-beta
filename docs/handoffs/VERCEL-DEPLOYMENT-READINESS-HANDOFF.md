# Vercel Deployment Readiness — handoff

**From:** Vercel deployment readiness agent
**To:** Next Manhwa Studio engineering agent
**Date:** 24 October 2026
**Branch:** `task/VERCEL-DEPLOYMENT-READINESS` (base `1f9d2a6`, tip of `task/TASK-05-END-TO-END-READINESS`)
**Full detail:** [`docs/audits/TASK-VERCEL-DEPLOYMENT-READINESS-REPORT.md`](../audits/TASK-VERCEL-DEPLOYMENT-READINESS-REPORT.md)

---

## 1. Read this first

1. **Nothing was deployed.** No Vercel project exists; no credentials for Vercel exist in this
   environment. The guide (`docs/DEPLOYMENT-VERCEL.md`) is complete enough to configure it, but every
   origin in it is a `<placeholder>` on purpose.
2. **The only live API was returning 503 on every path** during this task (`Site temporarily
   unavailable`, platform hosting pause — the Sites record still says `published`). Live connectivity,
   CORS and session checks are **blocked, not passed**.
3. **`main` is `49ed52c`** and was not touched. Nothing was merged, migrated, or reconfigured.

## 2. Branch topology — the important part

```
main 49ed52c ──┬── task/TASK-01-corrective-review (0ed6b08)   9 commits: DOM tests, sanitizer, docs
               └── task/TASK-05-END-TO-END-READINESS (1f9d2a6)  37 commits: Worker API, D1, auth, client
                        └── task/VERCEL-DEPLOYMENT-READINESS    this task
```

These two branches **diverge** and neither contains the other. This task is based on the TASK-05 line
because that is the only tree with a backend to connect to (TASK-01 has **zero** `fetch` calls and no
`worker/` directory).

**Before anything reaches `main`, decide the order.** Suggested: TASK-05 line first (it carries the API
and the shared foundation), then replay TASK-01's 9 corrective commits on top, resolving conflicts in
`src/App.tsx`, `src/lib/storage.ts` and the tests. Do not force-push or rewrite either branch.

## 3. State of this branch

| Check | Exit | Result |
|---|---|---|
| `bun install --frozen-lockfile` | 0 | no changes; `bun.lock` + `package.json` byte-identical to base |
| `bunx tsc --noEmit` | 0 | clean |
| `bun run lint` | 0 | clean |
| `bun run test` | 0 | **262 pass / 0 fail**, 821 assertions, 17 files |
| `bun run build` | 0 | `index-CZYu5zqt.js` 715.03 kB, `index-CRYMZQXH.css` 40.90 kB |
| `scripts/verify-deployment.mjs` vs local workerd + local preview | 0 | **7/7 checks passed** |
| live deployment probe | — | **503 all paths** — blocked |

## 4. What changed (9 files)

- `vercel.json` — framework/install/build/output, SPA rewrite, security headers.
- `src/lib/apiConfig.ts` — explicit `VITE_API_BASE_URL` resolution (unset / valid / **invalid**).
- `src/lib/api.ts` — `api_not_configured` kind; HTML-instead-of-JSON diagnosed as missing config;
  plain-text outage bodies surfaced.
- `src/lib/cloudWorkspace.ts` — `api_misconfigured` state (never confused with "signed out").
- `src/components/CloudWorkspacePanel.tsx` — visible `API:` origin, misconfiguration remedy, and an
  inline note that a cross-origin host cannot keep the host-only session cookie.
- `.env.example`, `README.md` — deployment contract.
- `docs/DEPLOYMENT-VERCEL.md`, `scripts/verify-deployment.mjs`,
  `tests/vercel-deployment.test.ts`, this handoff, the audit report.

No Worker route, schema, auth or CORS logic was modified; no dependency was added.

## 5. Vercel configuration (authoritative values)

| Setting | Value |
|---|---|
| Root Directory | repository root |
| Framework Preset | `Vite` |
| Install Command | `bun install --frozen-lockfile` |
| Build Command | `bun run build` |
| Output Directory | `dist` |
| Env (Production + Preview) | `VITE_API_BASE_URL=https://<API origin>` — **public**, build-time, requires a new deployment |

Worker side: add the Vercel origin to `ALLOWED_ORIGINS` (exact match, no wildcard). CORS code already
exists in `worker/src/origins.ts`; nothing needs writing.

## 6. Capability truth table

| Feature | Reality |
|---|---|
| Browser-local projects, bible, scripts, approvals, analytics | **Works** (`localStorage`, one browser) |
| Demo AI workbench | **Demo only**, labelled, never inserted into project data |
| Shared cloud workspace (projects, profiles, bibles, episodes, credits) | **Implemented + unit-tested**; needs a reachable API, CORS, and a session — **not proven live** |
| Live AI generation | **Not verified**; needs `GEMINI_API_KEY` + `GEMINI_MODEL`; otherwise honest `provider_not_configured`, no charge |
| Sign-in from Vercel | **Implemented but unusable cross-site** (host-only `__Host-` cookie). Needs a shared parent domain or a same-origin proxy |
| Image/voice/video rendering, YouTube publishing | **Not implemented** |

## 7. Reproduce the checks

```bash
bun install --frozen-lockfile && bunx tsc --noEmit && bun run lint && bun run test && bun run build

# local API (real workerd + D1/R2 bindings)
bunx wrangler dev --port 8799 \
  --var APP_ORIGIN:http://127.0.0.1:8799 \
  --var ALLOWED_ORIGINS:https://example-vercel.test

# local production preview (note: bind IPv4 explicitly or curl [::1])
bunx vite preview --port 4173 --host 127.0.0.1

node scripts/verify-deployment.mjs \
  --api http://127.0.0.1:8799 --origin https://example-vercel.test --frontend http://127.0.0.1:4173
```

## 8. Exact next action

1. Restore API reachability (unpause the Freebuff site, or deploy the owner's Worker per
   `docs/DEPLOYMENT.md` with `ALLOWED_ORIGINS` set).
2. Create the Vercel project from this branch using §5, set `VITE_API_BASE_URL`.
3. Run `scripts/verify-deployment.mjs` against the real pair and require **exit 0**.
4. Then, and only then, claim the deployment is verified — including one human browser pass: sign in,
   create one cloud project, reload, and see it persist.

**Do not** merge to `main`, apply `0002`/`0003` to a live database, or change production secrets
without the owner's explicit instruction.

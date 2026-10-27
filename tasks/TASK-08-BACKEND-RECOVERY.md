# TASK 08 — Backend recovery and deployment preparation

**Branch:** `task/TASK-08-BACKEND-RECOVERY`
**Base:** `604ffa8` (`main` `d0eba90` + the TASK-07 reconciliation)
**Status:** complete on this branch. Diagnosis and deployment plan delivered; **no live change made**.

## Objective

Determine the fastest, safest, lowest-cost route to a working live backend for Manhwa Beta, without
creating duplicate production resources, and prepare — but do not execute — the exact deployment steps.
No more frontend features until backend availability is resolved.

## What the briefing assumed

- "The documented Freebuff backend" may be returning **HTTP 503** / the hosting may be suspended.
- An existing Cloudflare Worker deployment may need **recovering**.
- The D1 database and R2 bucket may no longer exist.
- `main` may be `49ed52c9`; branches `TASK-01-corrective-review` / `TASK-05` / `VERCEL-*` may diverge.

## What is actually true today (verified 27 Oct 2026 — see the report)

1. **The backend is up, not down.** The Freebuff host answers 200 on `/`, `/healthz`, `/readyz` and 401
   on `/api/v1/me`. Hosting quota is `active` (159/100,000 monthly requests). The 503 is resolved.
2. **But that deployment is ~40 commits stale and cannot serve this app.** It predates `fe80671`
   (23 Oct); `/api/v1/projects` is 404, no CORS headers are emitted, and **no frontend assets** are
   deployed. The repo's own verifier scores it **5/7 (exit 1)**.
3. **There is no owner-owned Worker to recover** — the account's script list is empty and the account
   has **no `workers.dev` subdomain**. The Worker bundles cleanly for workerd (192.20 KiB / 44.12 KiB gzip).
4. **The owner's D1 and R2 still exist and match `wrangler.toml`.** D1 `manhwa-studio`
   (`d9557398-b439-463a-b5aa-a3703d5c3fdb`) already has migration **`0001` applied** and 7 tables
   (including `assets`), all empty. R2 `manhwa-studio-assets` exists.
5. **An untracked duplicate migration blocks the whole migration step.** `migrations/0002_assets.sql`
   fails with `table assets already exists` and aborts the run — reproduced locally with the identical
   error. It must be moved before any apply.
6. **A Vercel frontend already exists and is live** at <https://manhwa-beta.vercel.app>, built from the
   pre-`3423a20` (23–26 Oct) code **with no API origin**, so it is honestly disconnected.
7. **Nobody can obtain an organization**, so the shared workspace cannot work yet: every
   `INSERT INTO organizations` in the repository is in a test file. A signed-in user would get
   `403 Not a member of any organization` forever.
8. **Two D1 databases exist for one product** (a platform-bound one inside the Freebuff site, and the
   owner's). Which one is authoritative is an owner decision; the report recommends the owner's.

## Recommendation

**Option B — deploy this repository's Worker to the owner's own Cloudflare account**, keeping the
owner's D1 as the single authoritative store, then point the existing Vercel build at it
(`VITE_API_BASE_URL`). It needs **no code change**, creates **no new infrastructure**, costs **$0** on
the free tier, and is the only option in which every required setting (`ALLOWED_ORIGINS`, vars, secrets,
domain, migrations) is actually settable by the owner with verified credentials.

Options A (continue on the Freebuff-hosted site) and C (another host) were evaluated in full and rejected
with reasons — A cannot even configure a cross-origin allow-list with the tooling that exists, and C
would rewrite the data layer and create a third divergent store.

## Completed

- [x] Verified the live backend, hosting state, quota, deployment receipts and bindings (read-only).
- [x] Established by string forensics which revision is live (~pre-`fe80671`, 20–22 Oct).
- [x] Confirmed the owner's Worker deployment does not exist and cannot be reached on `workers.dev` yet.
- [x] Verified D1 and R2 exist, match `wrangler.toml`, and that D1 holds `0001` only.
- [x] Audited all four migration files, proved the stray file aborts the apply, and confirmed the two
      tracked migrations are additive with **no data-loss risk** (all tables empty).
- [x] Audited auth, CORS, cookie topology and the AI adapter against the actual code.
- [x] Found the organization-provisioning gap that gates real usability.
- [x] Identified the live Vercel deployment and proved it was built without an API origin.
- [x] Compared options A/B/C on owner actions, free-tier limits, credentials, DB/storage/auth
      compatibility, complexity, data-loss risk and effort; recommended one with evidence.
- [x] Produced the ordered deployment checklist, split into read-only / local / reversible /
      owner-approved groups.
- [x] Corrected `README.md` and `docs/DEPLOYMENT.md`, whose live-state claims had gone stale.

## Not done, deliberately

No deploy, no remote migration, no production data write, no OIDC registration, no secret or production
setting change, no paid service, no AI spend, no merge, no force-push, and no modification of `main` or
any existing branch. The untracked stray migration was left in the working tree rather than deleted.

## Next task

**TASK 09 — first-organization provisioning**, so a signed-in user can actually use the shared
workspace; and, on the owner's authorization, execute Group 4 of the checklist (deploy, migrate, seed,
point the frontend). Both are recorded in the handoff.

## Evidence

- Report: [`docs/audits/TASK-08-BACKEND-RECOVERY-REPORT.md`](../docs/audits/TASK-08-BACKEND-RECOVERY-REPORT.md)
- Handoff: [`docs/handoffs/TASK-08-BACKEND-RECOVERY-HANDOFF.md`](../docs/handoffs/TASK-08-BACKEND-RECOVERY-HANDOFF.md)
- Procedure: [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)

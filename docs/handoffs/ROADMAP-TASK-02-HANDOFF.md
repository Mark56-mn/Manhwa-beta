# ROADMAP TASK 02 — Handoff (documentation reconciled; stack still unmerged)

**From:** documentation-reconciliation agent
**To:** next roadmap agent / repository owner
**Date:** 22 October 2026
**Roadmap:** `Manhwa_Beta_14_Task_Roadmap.md` — TASK 02
**Report:** `docs/audits/ROADMAP-TASK-02-IMPLEMENTATION-REPORT.md`

> Read `tasks/ROADMAP-RECONCILIATION.md` first: it now contains the authoritative roadmap ↔ repo task
> mapping and the architecture flow. Do not merge anything, and do not start roadmap TASK 03, without the
> owner's explicit instruction.

## 1. Task ID / status

**TASK 02 — COMPLETE (documentation-only).** Stale status, test-count, CI, deployment and provisioning
claims corrected across 13 documents; two documents added; all four local gates re-run with exit 0.

Deliberately **not** done: no code, dependency, schema, auth, provider or deployment-config change; no
merge, no PR, no deploy, no migration, no TASK 03 work.

**Owner decision still in force (from TASK 01):** GitHub Actions is not part of the validation workflow.
Never report a GitHub Actions run as passing — there is none.

## 2. Branch and exact commit SHAs

- Branch: **`task/TASK-01-reconcile-ci`** (pushed to `origin`, **not merged**)
- `main`: `49ed52c9f960b8e50ab61a21a6f2bfc7128fa5a2` — unchanged, **0 behind**
- TASK 01 tip (this task's base): `33018ff74da338676a76ecde4a37c9a5eb85ab47`
- **TASK 02 corrections commit: `754dac5d9b8ebebbe3f25e911f5d9dee085fb544`** (13 Markdown files)
- This report + handoff: **one commit directly above `754dac5`** — the TASK 02 tip is
  `git rev-parse HEAD` on the branch; it differs from `754dac5` only by these two files
- Branch contains the full 16-commit TASK 02–12 stack plus TASK 01; `git diff --stat main...HEAD` is
  47 files before these docs, 49 after

## 3. Changes and file paths

Modified: `README.md`, `docs/DEPLOYMENT.md`, `tasks/ROADMAP-RECONCILIATION.md`,
`docs/audits/TASK-03-CAPABILITY-INVENTORY.md`, `docs/audits/TASK-05/06/07-IMPLEMENTATION-REPORT.md`,
`docs/audits/ROADMAP-TASK-01-IMPLEMENTATION-REPORT.md`,
`docs/handoffs/TASK-05/06/07/12-HANDOFF.md`, `docs/handoffs/ROADMAP-TASK-01-HANDOFF.md`.
Added: this file and `docs/audits/ROADMAP-TASK-02-IMPLEMENTATION-REPORT.md`.

Nothing outside Markdown changed. `src/`, `worker/`, `migrations/`, `tests/`, `package.json`,
`bun.lock`, `wrangler.toml`, `scripts/` and `.env.example` are byte-identical to `33018ff`.

## 4. Exact commands run and results

Bun **1.4.4** (version printed first), fresh `node_modules`, `set -o pipefail`, exit codes captured directly:

```text
bun install --frozen-lockfile   # exit 0 — 126 packages, lockfile unchanged
bun run lint                    # exit 0 — tsc --noEmit, no diagnostics
bun run test                    # exit 0 — 59 pass, 0 fail, 112 expect(), 5 files
bun run build                   # exit 0 — dist/ emitted; 2 advisories (chunk >500 kB; configLoader/__dirname)
```

Documentation review commands used, all reproducible:

```text
git rev-list --count origin/main..HEAD      # 24 (16-commit stack + merge + TASK 01/02 docs)
git merge-base origin/main HEAD             # 49ed52c (equal to main's tip → 0 behind)
git diff --stat main...HEAD                 # 47 files, 3950 insertions, 402 deletions (before TASK 02)
git ls-tree 8d74d67 --name-only .github      # the deleted ci.yml existed only on the stacked branch
rg -n "4[36] (pass|tests)|501|stubs" docs    # located every stale count/route claim fixed here
```

## 5. Tests added / updated

None — documentation-only, and none were needed or weakened. The 59 existing tests all pass unmodified:
`honesty`, `storage`, `seed-data`, `tenancy` (tenant isolation, sub-keyed membership, cascades) and
`asset` (401/403, cross-org 403, same-origin guard, type allow-list, 10 MiB cap).

## 6. Known issues and unverified claims

- **Live D1/R2 state is still owner-reported.** No task since TASK 07 has re-verified it; `docs/DEPLOYMENT.md`
  now says "REPORTED" instead of "live".
- **No Worker deployment exists.** Health/readiness/asset routes have only run in tests and local workerd.
- **Auth is unverified end-to-end.** No Freebuff OIDC client is registered; only `auth_not_configured`
  (503) has been observed.
- **The frontend never calls the API.** Cloud persistence is `planned`; `localStorage` is still the only
  store, and honesty tests enforce that no network calls appear in `src/`.
- **No down-migrations**, so a destructive schema change has no rollback path.
- **Stack is unmerged and owner review is outstanding** — 24+ commits ahead of `main`.
- **Bun ≥ 1.4 is documentation-only** (no `packageManager`/`engines` field); a Bun 1.3.x install fails with
  `Unknown lockfile version`.
- Passing local gates ≠ production-ready.

## 7. Environment variables and owner actions

No new variables. Documented names only (values never committed): `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN`, plus provider keys when a
later task needs them.

Owner actions, in order:

1. **Review and merge** `task/TASK-01-reconcile-ci` (no squash — it carries the task reports the roadmap
   needs). Compare: `https://github.com/Mark56-mn/Manhwa-beta/compare/main...task/TASK-01-reconcile-ci`
2. **Register the Freebuff OIDC client** (owner login only) before roadmap TASK 03 can be verified.
3. **Authorize any deploy** explicitly — nothing in this branch may be deployed without it.
4. Do **not** re-enable GitHub Actions.

## 8. Deployed versus documented

**Nothing deployed, nothing migrated, no secrets set.** Everything in this task is documentation, and every
infrastructure statement in the docs is either local-test evidence or an owner-reported claim labelled as
such.

## 9. Exact next task and prerequisites

**Next: investigate dual-host feasibility — a Vercel-hosted build and a Freebuff-hosted build of the *same*
codebase sharing one authoritative backend, database, identity, projects, credits and job state.**

Recorded product direction (do not implement it before the feasibility task): two frontends, one backend,
one identity, no competing copies of customer data, no divergent behaviour between hosts.

Prerequisites and questions that investigation must answer honestly:

- **Identity across hosts:** `FREEBUFF_ISSUER` / `FREEBUFF_CLIENT_ID` / `APP_ORIGIN` are single-origin
  today (`worker/src/env.ts`, `worker/src/auth.ts`); two deployed origins need a documented answer
  (multiple redirect URIs? a shared session cookie domain? cookie-less bearer tokens?). Do **not** invent a
  second auth system.
- **CORS and the same-origin guard:** asset mutations compare `Origin` to a single `APP_ORIGIN`
  (`worker/src/assets.ts`). Two hosts require an explicit origin allow-list, not `*`.
- **Nothing may be duplicated:** one D1 database, one R2 bucket, one credit ledger, one job state.
- **Roadmap TASK 03 remains the implementation prerequisite** for anything involving real sign-in or
  cross-tenant proof: register the OIDC client, verify 401/403 and two-tenant isolation against a real
  session, then and only then claim roadmap TASK 03.
- **Do not start roadmap TASK 03 or the dual-host work without the owner's instruction.**

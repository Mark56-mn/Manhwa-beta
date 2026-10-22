# ROADMAP TASK 01 — Reconcile branches and repair CI (implementation report)

**Roadmap:** `Manhwa_Beta_14_Task_Roadmap.md` (22 October 2026), TASK 01
**Status:** **PARTIAL** — branch integration and reproducible CI configuration are done and locally verified; a **green GitHub Actions run cannot be produced yet** because GitHub has locked the account for a billing issue (evidence in §4). No PR was opened from this environment (no GitHub CLI credentials here).
**Date:** 22 October 2026

## 0. Documentation naming convention (decision for this task series)

The repository already uses `TASK-01…TASK-12` for its own internal task sequence, and those numbers do **not** map onto the roadmap's 14 tasks (repo `TASK-12` = R2 asset routes, roadmap `TASK 12` = owner approval). To avoid overwriting the existing `TASK-01` report/handoff that `main` just updated, roadmap tasks are documented with a `ROADMAP-` prefix:

- `docs/audits/ROADMAP-TASK-NN-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/ROADMAP-TASK-NN-HANDOFF.md`
- branches: `task/TASK-NN-short-name` (unchanged; the roadmap's own branch convention)

Existing `docs/audits/TASK-01-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-01-HANDOFF.md` were **not** modified by this task.

## 1. Repository state at task start (verified, not inferred)

| Ref | SHA | Note |
| --- | --- | --- |
| `main` (fetched 22 Oct 2026) | `49ed52c9f960b8e50ab61a21a6f2bfc7128fa5a2` | "fix: replace mock YouTube connect/upload flow…" |
| `task/TASK-07-d1-tenancy-foundation` | `8d74d67c8b6944275335dcce00bbdb1f3e127071` | tip of the stacked Worker/D1 work |
| merge base | `49ed52c` | i.e. `main`'s tip |

`git rev-list --left-right --count origin/main...task/TASK-07-d1-tenancy-foundation` → **1 16**: the branch was **16 commits ahead and 1 commit behind `main`**, which matches the roadmap baseline exactly. `main` itself had moved 8 commits past the older `origin/main` ref that existed in this clone, so the fetch was required before merging.

The branch was **not** pushed to `origin` (only local + `pr/1`…`pr/3` remote refs existed).

## 2. Integration result

- Integration branch created from the TASK-07 tip: **`task/TASK-01-reconcile-ci`**.
- Merged `origin/main` (`49ed52c`) with an explicit `--no-ff` merge — **no force-push, no rebase, no commits discarded**.
- Merge commit: **`1e1e8d4`** ("merge: integrate main 49ed52c into TASK-07 integration branch (TASK 01)").
- **Conflicts: exactly one file** — `tasks/TASK-01-stabilize-existing-app.md`. Both sides had independently replaced the obsolete Firebase next-step with a "superseded" note. Resolution keeps `main`'s newer 20 October wording and adds the branch's pointer to `tasks/TASK-02-finish-task-01-verification.md`; no content from either side was dropped.
- `src/components/ApprovalCenter.tsx` was touched by both histories with identical 243-line changes (main `49ed52c`, branch `ab5b25e`); after the merge it is **byte-identical to `main`'s version** (`git diff 49ed52c HEAD -- src/components/ApprovalCenter.tsx` is empty), so the honest "YouTube: Not connected" flow was not duplicated or lost.
- No conflict markers remain anywhere in the tree.
- Reachability check: `main`'s tip and the TASK-07 tip are both ancestors of the integration branch.

## 3. Files changed by this task

| File | Change |
| --- | --- |
| `tasks/TASK-01-stabilize-existing-app.md` | conflict resolution (merged superseded-note wording) |
| `.github/workflows/ci.yml` | Bun pinned to `1.4.4`; added a `bun --version` step; replaced the stale "has NOT been executed yet" header with the actual run/billing evidence |
| `docs/audits/ROADMAP-TASK-01-IMPLEMENTATION-REPORT.md` | this report |
| `docs/handoffs/ROADMAP-TASK-01-HANDOFF.md` | handoff |

No application, Worker, migration, test, or dependency changes. No secrets added.

## 4. CI root cause (confirmed from the real run, not guessed)

The only Actions run in the repository is **run `39372282697`**, workflow `CI`, branch `task/TASK-07-d1-tenancy-foundation`, head SHA `8d74d67`, created `2026-10-20T04:57:14Z`.

Evidence gathered through the public GitHub API:

- Run: `status: completed`, `conclusion: failure`; job `118462592164` "install → lint → test → build", also `failure`.
- The job's `started_at` and `completed_at` are **2 seconds apart**, and the jobs payload contains **no executed steps**.
- Check-run annotation on `118462592164`:

  > `The job was not started because your account is locked due to a billing issue.`

  (second annotation is only the `ubuntu-latest` → Ubuntu 26 migration notice.)

**Root cause: the job never ran. GitHub Actions is blocked at the account level by a billing lock.** This is not a failing test, typecheck, or build step, and no code change can fix it. Job logs (`…/actions/jobs/<id>/logs`) return HTTP 403 to unauthenticated callers, so step-level logs do not exist to inspect — the billing annotation is the terminal explanation.

Because no CI run has ever executed a step, **there is no green run link to report**. Locally reproducing the workflow's exact steps fills that gap (see §5).

## 5. Reproducibility of the workflow (real defect found and fixed)

Reproducing the workflow surfaced a genuine, independent defect: the committed `bun.lock` is **`"lockfileVersion": 2`**, which was introduced by **Bun 1.4**. On Bun 1.3.x the install step dies immediately:

```
error: Unknown lockfile version
    at bun.lock:2:22
UnknownLockfileVersion: failed to parse lockfile: 'bun.lock'
warn: Ignoring lockfile
error: lockfile had changes, but lockfile is frozen
```

With `bun-version: latest` the gate depended on whichever Bun the runner resolved that day. `ci.yml` now pins **`bun-version: 1.4.4`** (the current release at the time of writing) so the frozen install is deterministic.

The lockfile itself was **not** downgraded and **no dependency was upgraded**: `bun install --frozen-lockfile` on Bun 1.4.4 accepts the existing lockfile unchanged.

## 6. Checks run on the exact candidate commit `696351b` (integration + CI fix)

Environment: Linux x64, Bun **1.4.4** (`~/.bun/bin/bun`), fresh `node_modules` (deleted first), `set -o pipefail` in effect, exit codes captured directly (not piped).

| Step (as CI runs it) | Command | Result |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | **exit 0** — 126 packages, lockfile untouched, `git status` clean afterwards |
| Typecheck / lint | `bun run lint` (= `tsc --noEmit`) | **exit 0**, no diagnostics |
| Tests | `bun run test` (= `bun test`) | **exit 0** — **59 pass, 0 fail**, 112 `expect()` calls, 5 files |
| Production build | `bun run build` (= `vite build`) | **exit 0** — 2245 modules, `dist/` emitted (only the pre-existing Vite config/chunk-size warnings) |

Test files exercised (unchanged, all passing): `tests/tenancy.test.ts`, `tests/asset.test.ts`, `tests/storage.test.ts`, `tests/honesty.test.ts`, `tests/seed-data.test.ts`. Worker, D1/R2, tenant-isolation and same-origin/security assertions are preserved — nothing was skipped, weakened or deleted.

The same suite also passes on the merge commit `1e1e8d4`.

## 7. Secrets scan

- Tracked environment files: `.env.example` only; it contains placeholders (`CLOUDFLARE_API_TOKEN="REPLACE_ME"`).
- `scripts/store-secrets.sh` reads values at a hidden prompt and writes `.env.local` (gitignored, mode 600); it contains no values.
- Regex scan for `AIza…`, `sk-…`, `ghp_…`, private-key headers, `client_secret`, and real token assignments: only the placeholder and documentation references found.
- No unrelated or generated files were added; `dist/`, `node_modules/` remain gitignored.

## 8. Known gaps / unverified claims

1. **No green CI run exists.** Acceptance criterion "CI passes on the exact candidate commit" is **unmet** until the owner clears the Actions billing lock and a run executes. Local reproduction of all four steps is the only evidence so far.
2. **No PR was opened.** `gh` in this environment is unauthenticated (`gh auth status` → not logged in), so a pull request could not be created from here; the branch is pushed and ready for a PR.
3. **Not merged** — correctly so; the roadmap forbids merging without review.
4. **No deployment or migration** was performed or claimed. The Worker was not deployed; D1/R2 live state was not re-verified by this task.
5. Local host uses Bun 1.4.4 installed under `~/.bun`; the project still has no `packageManager`/`engines` field, so a developer on Bun 1.3.x will hit the "Unknown lockfile version" error. Documenting the required Bun version in the README belongs to ROADMAP TASK 02 (documentation reconciliation), not this task.

# TASK 02 — Finish Task 01 verification and resolve stabilization gaps

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 1 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Close the outstanding stabilization work before adding product features. The prior changes removed the most obvious fake generator/analytics claims, but runtime verification, branch-history discrepancy, and adjacent mock-success paths are not yet resolved.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Starting point / known open work

- The corrective changes are in `task/TASK-01-corrective-review` and the draft PR is #1. Do not merge it or modify `main` as part of this task.
- Build, typecheck, and browser behavior were not independently verified in the connector-only review.
- Earlier report claims a task branch, while the corresponding commit appears in `main` history. Preserve history and document the discrepancy; do not attempt to rewrite it.
- The generator and analytics corrections require runtime review to ensure the code compiles and no remaining callback can persist demo content.

## Work

1. Read `tasks/TASK-01-stabilize-existing-app.md`, the corrective report/handoff, and the current branch diff.
2. Check out `task/TASK-01-corrective-review` in an actual runtime. Install dependencies with the repository's intended package manager, then run `npm run build` and `npm run lint` (inspect package.json so the report explains that lint is `tsc --noEmit` if still true). Record exact output/exit codes.
3. Manually test project create/edit/delete/reload, modal open/close, demo generator, analytics, and approvals. Confirm demo text cannot be inserted into any Story Bible or script.
4. Inspect the diff for accidental changes, unused dependencies/imports, and any browser-side secret handling. Fix only defects needed to finish stabilization.
5. Verify `.env.example` contains placeholders only and does not imply an integration works when it does not.
6. Update the Task 01 report/handoff with facts, not assumptions. Keep the history discrepancy documented without destructive Git operations.

## Acceptance criteria

- Build and typecheck have actual recorded results; failures are fixed or listed as blockers with exact error output.
- No demo generator result can be saved as real project content.
- No fake success message represents an operation that did not happen.
- All storage limitations are clearly documented as browser-local.
- No credentials are committed; no unverified integrations are described as live.
- Task 01 remains isolated in its branch/PR and is not silently merged.

## Deliverables

Updated Task 01 audit/handoff, task-specific report/handoff, and a concise manual-test checklist with pass/fail results.

## Required handoff

Create/update:
- `docs/audits/TASK-02-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-02-HANDOFF.md`

The handoff must name the next task, but must not start it.
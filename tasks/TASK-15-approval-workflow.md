# TASK 15 — Implement explicit approval workflow and publication gate

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 14 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Make approvals an auditable state machine and ensure unapproved or failed media cannot be published publicly.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Prerequisites

Tasks 10, 13, and 14 must be complete.

## Work

1. Define approval records with tenant/project/asset/version, reviewer UID, decision, notes, timestamps, and the exact content hash/version reviewed.
2. Support pending, approved, rejected, changes_requested, and superseded states with validated transitions.
3. Require approval of the exact render version that will be published; changes to source assets or render manifest must invalidate or supersede the prior approval as appropriate.
4. Keep demo approval records visibly marked as sample and separate from real approvals. Do not treat the existence of any approval array entry as proof that a video is approved.
5. Enforce approval checks on the backend, not just by hiding a button in the frontend.
6. Add tenant roles/permissions for who can approve; record an audit event for each decision.
7. Test unapproved publish rejection, stale approval, wrong-tenant access, rejected assets, permission failures, and re-approval after revision.

## Acceptance criteria

- Approval is tied to a specific immutable render version.
- Backend blocks publication if approval is missing, stale, rejected, or unauthorized.
- Audit trail shows who approved what and when.
- UI accurately distinguishes sample approvals from real owner approvals.

## Required handoff

Create/update:
- `docs/audits/TASK-15-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-15-HANDOFF.md`

The handoff must name the next task, but must not start it.
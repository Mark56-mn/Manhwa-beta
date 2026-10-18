# TASK 07 — Design tenant-safe Firestore data model and migrate project persistence

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 6 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Replace browser-only project persistence with a secure cloud data layer while preserving existing local projects.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Prerequisites

Task 06 must establish real Firebase Auth. If Auth is not working, write and review the schema/security design only; do not pretend cloud persistence exists.

## Work

1. Define a versioned Firestore schema for users, tenants/workspaces, memberships/roles, projects, Story Bible, episodes/scenes, approvals, assets, jobs, and audit events. Every customer-owned record must have an explicit tenant/workspace ownership path.
2. Use the authenticated UID and membership checks to scope reads/writes. Do not trust a client-supplied `userId` or `tenantId` without server/security-rule verification.
3. Write Firestore Security Rules with deny-by-default behavior. Add tests/emulator checks for cross-tenant reads/writes, unauthenticated access, role limits, and ownership.
4. Create a repository/data-access layer so UI components do not call Firestore ad hoc.
5. Build a safe import/migration flow from `localStorage` key `manhwa_studio_projects`: preview count, validate schema, require user confirmation, avoid duplicates, preserve a local export/backup, and report per-record failures.
6. Add loading/offline/error/sync states. Do not delete local data automatically after migration.

## Acceptance criteria

- Cross-tenant access is denied by rules/tests.
- Projects are read/written from Firestore only when configured and authenticated.
- Existing local projects can be exported and safely imported without silent loss.
- Schema versioning and migration instructions are documented.

## Required handoff

Create/update:
- `docs/audits/TASK-07-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-07-HANDOFF.md`

The handoff must name the next task, but must not start it.
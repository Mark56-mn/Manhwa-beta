# TASK 03 — Audit and neutralize misleading mock states across the app

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 2 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Find every UI action that looks like a real operation but is currently a placeholder, local-only action, or simulation.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Work

1. Search the entire repository for `mock`, `demo`, `sandbox`, `TODO`, `coming soon`, `alert(`, fake delays, hardcoded success strings, placeholder URLs, and buttons with empty/no-op handlers.
2. Inspect approvals, asset management, upload/publish actions, API settings, project creation, analytics, and AI generation.
3. For each action, classify it as: working local action, working remote integration, demo-only, unavailable, or broken. Record evidence in a table.
4. For demo/unavailable actions, disable misleading actions or label them clearly. Never display “uploaded”, “published”, “approved”, “generated”, “synced”, or “saved to cloud” unless that event actually occurred.
5. Ensure demo data is visibly identified and cannot overwrite or masquerade as customer-created data. Do not remove user projects or seed data without a safe migration/confirmation.
6. Add a concise “integration status” pattern that can be reused without inventing statuses; avoid a large UI redesign.

## Acceptance criteria

- All user-facing high-impact actions have an honest status and outcome.
- No fake success alerts remain for unimplemented remote operations.
- A table in the report lists each audited action, its true status, and the fix or reason it remains a demo.
- No unrelated feature work is included.

## Required handoff

Create/update:
- `docs/audits/TASK-03-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-03-HANDOFF.md`

The handoff must name the next task, but must not start it.
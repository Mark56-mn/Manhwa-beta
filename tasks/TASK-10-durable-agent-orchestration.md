# TASK 10 — Create durable agent task queue and orchestration state machine

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 9 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Replace any simulated agent collaboration with persistent, inspectable work items and safe retries.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Prerequisites

Tasks 07–09 must establish tenant-scoped persistence and server-side AI routing.

## Work

1. Define durable task/job records: tenant, project, task type, inputs/references, dependencies, status, attempt count, idempotency key, progress events, output references, error category, timestamps, cancellation, and approval requirement.
2. Use explicit states such as queued, running, waiting_for_dependency, waiting_for_approval, succeeded, failed, cancelled. Validate legal transitions centrally.
3. Implement a worker/dispatcher compatible with the selected hosting platform. Do not rely on an in-memory array or a web request remaining open for long work.
4. Add bounded retries with backoff for transient errors; do not retry permanent errors indefinitely. Use idempotency to prevent duplicate assets or credit charges.
5. Store task events and agent handoffs so specialized agents share persistent context through records, not just prompt messages.
6. Add per-tenant concurrency/quotas, cancellation, timeouts, and a way for the user to inspect task status.
7. Create deterministic tests for transitions, retry rules, dependency failures, duplicate submissions, and tenant isolation.

## Acceptance criteria

- Jobs survive server restarts and can be resumed/inspected.
- Agent-to-agent work uses persisted inputs/outputs and dependencies.
- Failure and waiting states are visible; no task is marked complete before its output is stored and validated.
- Worker hosting and cost/free-tier limits are documented.

## Required handoff

Create/update:
- `docs/audits/TASK-10-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-10-HANDOFF.md`

The handoff must name the next task, but must not start it.
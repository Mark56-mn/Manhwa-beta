# TASK 05 — Add a minimal automated test and quality gate

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 4 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Make regressions detectable before adding authentication, cloud data, or AI workflows.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Work

1. Inspect existing test tooling before adding dependencies. Choose the smallest compatible test setup for the existing Vite/React/TypeScript project.
2. Add tests for project data initialization, project create/update/delete rules, localStorage parse failure/recovery, and demo generator non-persistence.
3. Add tests or a deterministic manual test script for analytics counts and empty states. Test that unsupported integrations are not represented as successful.
4. Add a single documented command for tests. Keep `npm run build` and `npm run lint`/typecheck distinct in documentation, even if lint currently invokes TypeScript only.
5. Avoid snapshotting the entire UI or writing brittle tests that merely assert implementation details.
6. Add a short smoke-test checklist for mobile-sized viewport and desktop.

## Acceptance criteria

- Tests run locally with documented commands and actual results.
- Core project state behavior and demo safety are covered.
- CI is not assumed available; do not add GitHub Actions as a requirement.
- Any test that cannot run in the current environment is clearly identified, not reported as passed.

## Required handoff

Create/update:
- `docs/audits/TASK-05-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-05-HANDOFF.md`

The handoff must name the next task, but must not start it.
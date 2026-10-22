# TASK 08 — Build a server-side AI provider gateway

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 7 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Route model requests through a server-side API instead of calling model providers directly from the browser.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Prerequisites

Tasks 02–07 must be complete or explicitly signed off. Do not put provider keys in Vite `VITE_*` variables or localStorage.

## Work

1. Inspect the chosen backend/deployment architecture and select one supported server runtime compatible with the current deployment. Document the decision before implementing.
2. Create a provider-neutral request/response contract for text generation: request ID, tenant/user, task type, selected provider/model, input, limits, usage metadata, and structured error.
3. Store provider keys only in backend environment secrets. Validate required configuration at startup without printing secret values.
4. Implement authentication verification, request validation, rate limits, input/output size limits, timeouts, cancellation where supported, and safe error handling.
5. Add at least one real provider adapter only when a valid key is configured. When unconfigured, return a typed “provider not configured” response rather than demo text.
6. Redact prompts or sensitive content from logs by default. Add tenant-aware usage records and basic abuse controls.
7. Document API routes and test provider errors, invalid input, auth failures, timeout, and success with a mock adapter. Clearly distinguish mock tests from real-provider tests.

## Acceptance criteria

- Browser never receives provider secrets.
- Real generation is invoked only through backend gateway.
- Missing provider returns an honest error; no silent fake generation.
- Auth/rate-limit/validation tests pass and request IDs support troubleshooting.

## Required handoff

Create/update:
- `docs/audits/TASK-08-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-08-HANDOFF.md`

The handoff must name the next task, but must not start it.
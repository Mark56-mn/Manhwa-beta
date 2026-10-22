# TASK 06 — Implement Firebase Authentication foundation

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 5 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Add real sign-in and sign-out without exposing privileged credentials or pretending the app is authenticated when it is not.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Prerequisites

Tasks 02–05 must be completed and reviewed. If Firebase project configuration or approved credentials are unavailable, stop after implementing configuration scaffolding and report the blocker; do not fake a successful connection.

## Work

1. Choose Firebase Authentication methods appropriate for the product; begin with email/password or Google only if configured and tested. Phone-first onboarding is a future option, not an excuse to build fake OTP.
2. Add a typed auth module and environment-variable validation. Firebase web config is client configuration, but admin/service-account credentials must never be shipped to the browser.
3. Implement loading, signed-out, signed-in, sign-out, expired-session, and auth-error states. Do not render protected customer data while auth is unresolved.
4. Add a minimal account/profile screen with stable Firebase UID and timestamps; do not store provider secrets in user profile documents.
5. Document local development and deployment env keys with empty placeholders. Ensure app can start in an explicit unconfigured state.
6. Test sign-in/sign-out using a real configured Firebase project when available; never claim it passed without that.

## Acceptance criteria

- Auth state is derived from Firebase SDK, not a hardcoded boolean.
- No service account/admin key is in frontend bundle or repository.
- Unconfigured and error states are honest and usable.
- Auth tests/manual evidence and configuration requirements are recorded.

## Required handoff

Create/update:
- `docs/audits/TASK-06-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-06-HANDOFF.md`

The handoff must name the next task, but must not start it.
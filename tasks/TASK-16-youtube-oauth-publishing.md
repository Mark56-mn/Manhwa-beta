# TASK 16 — Integrate YouTube OAuth and gated upload workflow

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 15 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Add a real, secure YouTube connection and upload pipeline with owner approval before any public publication.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Prerequisites

Tasks 08, 10, 13–15 must be complete. Do not build around an unverified API key; YouTube channel authorization requires the appropriate OAuth flow and scopes.

## Work

1. Implement server-managed OAuth authorization-code flow with state/CSRF validation, least-privilege scopes, secure token storage, refresh/expiry handling, disconnect/revoke, and tenant/channel ownership checks.
2. Never expose refresh/access tokens to browser JavaScript, logs, task prompts, or client-readable Firestore documents.
3. Add channel connection status based on a real API check. An API key alone must not be presented as channel authorization.
4. Build upload jobs that use a real approved MP4, metadata (title, description, tags, category, language), thumbnail when supported, and resumable upload where appropriate.
5. Default to private or unlisted uploads where supported by configuration. Public publishing must require explicit owner approval for that exact video/version and an explicit publish action; no agent may bypass it.
6. Track real upload status, remote video ID/URL, privacy status, API errors, quota failures, and retry state. Use idempotency and do not blindly re-upload on ambiguous network errors.
7. Test OAuth failure/expiry, disconnected channel, wrong tenant, no approval, stale approval, upload interruption, quota exhaustion, and successful private/unlisted upload when credentials are available.

## Acceptance criteria

- Connection and upload status are based on actual YouTube API responses.
- Tokens are encrypted/protected server-side and never exposed to frontend.
- Public publishing is blocked until explicit owner approval and action.
- When credentials/quota are unavailable, UI reports not configured/blocked without fake success.

## Required handoff

Create/update:
- `docs/audits/TASK-16-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-16-HANDOFF.md`

The handoff must name the next task, but must not start it.
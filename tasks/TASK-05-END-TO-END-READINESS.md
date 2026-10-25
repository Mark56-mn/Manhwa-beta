# TASK 05 — End-to-End Readiness, Authentication, AI Generation, and Reliability

Scope:
- Verify the repository state and the TASK 04 implementation.
- Harden the same backend code until auth, tenant isolation, credits/jobs, and provider
  behavior are honestly testable.
- Prepare a controlled-preview deployment posture, but do **not** deploy, merge, apply
  live migrations, or register a client.
- Build the end-to-end test plan and run every gate that can run without live secrets.

Branch: `task/TASK-05-END-TO-END-READINESS`
Base: `task/TASK-04-PERSISTENT-STORY-GENERATION` tip `1f9d2a6ab5350088d726739a21c2ea79415a7009`

## Acceptance criteria

- [x] Repository state verified and recorded.
- [x] Authentication code audited and tested; live auth status honestly documented.
- [x] Migration `0003` concurrent version-allocation risk reviewed and test plan recorded; live DB/atomic enforcement deferred to an authorized environment.
- [x] Tenant isolation audited; two-tenant test proves cross-tenant rejection.
- [x] Concurrent version allocation is safe.
- [x] Interrupted-job and post-persistence failure handling implemented or documented.
- [x] Credit accounting tests cover issuance, reservation, settlement, refund, idempotency, and free-tier rejection.
- [x] Gemini provider behavior tested with a mock; missing live configuration documented.
- [x] Migrations `0002` and `0003` reviewed and validated against an isolated database; remain unapplied to live infrastructure.
- [x] End-to-end test plan written; run where credentials/permissions permit.
- [x] Deployment/dual-host posture assessed without production deploy.
- [x] Story Studio UI shows truthful status states.
- [x] Automated quality gates run and reported.
- [x] TASK-05 task, audit report, and handoff documents updated.
- [x] Changes committed to the task branch only (final commit recorded in the handoff).
- [x] No production deploy, OIDC registration, secret change, or live migration performed here.
- [x] Typecheck disposition decided: the repo `tsconfig.json` keeps the `bun` type lib because `tests/` imports `bun:test` and `bun:sqlite`; `tests/tsconfig.json` only restates `noEmit`. `bun run lint` (`tsc --noEmit`) passes with this configuration, so the repo config was not reverted toward `freebuff-base`.

## Required configuration (names only)

- `FREEBUFF_CLIENT_ID`
- `FREEBUFF_ISSUER`
- `APP_ORIGIN`
- `ALLOWED_ORIGINS`, if required by the backend.
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `DB` (D1 worker binding already declared in `wrangler.toml`)

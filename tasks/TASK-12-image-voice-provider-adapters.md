# TASK 12 — Add real image and narration provider adapters

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 11 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Introduce extensible image and voice interfaces without claiming generation exists until a real adapter is configured.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Prerequisites

Tasks 08–10 must be complete. This task defines provider adapters and a minimal end-to-end path; video assembly is a later task.

## Work

1. Define typed image and narration provider contracts, capability metadata, limits, usage/cost fields, and normalized errors.
2. Add adapters only for providers with documented APIs and valid configured credentials. Keep keys server-side; never put provider keys in browser code or project documents.
3. Create structured prompts from scene descriptions and character reference metadata. Include negative prompts/aspect ratio/style controls only where the provider supports them.
4. For narration, support voice selection, language, speed, and chunking where available; store pronunciation overrides as project data.
5. Create durable jobs and persist output metadata (provider, model/voice, prompt version, mime type, dimensions/duration, checksum, status). Do not store large base64 blobs in Firestore documents.
6. Add preview and explicit accept/reject before an asset is treated as approved canon. Clearly mark generated assets as AI-generated.
7. Add adapter contract tests, invalid credential tests, timeout tests, unsupported capability tests, and one real smoke test if credentials exist.

## Acceptance criteria

- Image/audio generation uses real configured providers only.
- Missing credentials produce clear unavailable states.
- Assets have stable IDs and metadata; no secret leakage or silent overwrite.
- Provider capabilities and limitations are documented.

## Required handoff

Create/update:
- `docs/audits/TASK-12-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-12-HANDOFF.md`

The handoff must name the next task, but must not start it.
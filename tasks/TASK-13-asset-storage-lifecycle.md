# TASK 13 — Implement secure asset storage and lifecycle management

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 12 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Store image/audio/video outputs outside Firestore documents with tenant-scoped access and durable metadata.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Prerequisites

Tasks 07, 10, and 12 must be complete or reviewed.

## Work

1. Use Firebase Storage (or an explicitly approved compatible object store) for binary assets; do not place large binaries/base64 in Firestore.
2. Define tenant/project-scoped object paths and verify ownership server-side. Security rules must deny cross-tenant reads/writes and public listing by default.
3. Store metadata in Firestore: asset ID, type, object path, content type, size, checksum, dimensions/duration, source task, generation parameters, version, approval state, and timestamps.
4. Validate file type, size, content headers, and generated upload paths. Do not trust client-provided paths or MIME type alone.
5. Use resumable uploads where appropriate, safe cleanup for abandoned temporary objects, and soft-delete/retention behavior. Never delete referenced assets as a side effect of unrelated project edits.
6. Add a media library with truthful upload/progress/failure states, preview, retry, delete confirmation, and references from scenes/episodes.
7. Test tenant isolation, oversized/invalid files, missing object, failed upload, cleanup safety, and metadata consistency.

## Acceptance criteria

- Binary assets live in object storage; metadata and references are queryable.
- Access is tenant-scoped and validated.
- Failed uploads are not marked successful; deletion does not orphan active project references silently.
- Retention, quotas, and expected storage costs are documented.

## Required handoff

Create/update:
- `docs/audits/TASK-13-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-13-HANDOFF.md`

The handoff must name the next task, but must not start it.
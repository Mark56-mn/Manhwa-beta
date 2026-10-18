# TASK 11 — Connect real story generation to the persistent Story Bible

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 10 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Implement the first real customer-facing AI workflow: generate and save story material with continuity and version control.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Prerequisites

Tasks 07–10 must be working. Do not implement a fake generation result when no provider is configured.

## Work

1. Define structured schemas for premise, world rules, characters, factions, arcs, episode outlines, scenes, and dialogue. Validate model output and return repairable validation errors.
2. Implement a story-generation task through the gateway and durable queue. Use the current project/Story Bible as explicit context and respect user-provided canon.
3. Save accepted output to Firestore with version IDs, author/source (user/model), model/provider metadata, created time, and links to the task. Keep previous versions recoverable.
4. Separate generated suggestions from canon: show preview/diff and require user confirmation before replacing existing canon or episode text.
5. Add continuity checks for duplicate character IDs/names, contradictions against locked world rules, missing references, and episode ordering. Explain warnings rather than silently rewriting canon.
6. Respect tenant boundaries and credits. Do not leak another project's content into model context.
7. Test valid output, malformed output, provider unavailable, retries, rejected suggestions, version restore, and concurrent edits.

## Acceptance criteria

- A configured provider generates real output based on the prompt/context.
- Accepted output persists; rejected output does not alter canon.
- Version history and continuity warnings work.
- Unconfigured provider is clearly reported as unavailable, not simulated.

## Required handoff

Create/update:
- `docs/audits/TASK-11-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-11-HANDOFF.md`

The handoff must name the next task, but must not start it.
# TASK 14 — Build real video assembly and quality-control pipeline

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 13 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Assemble approved scene assets and narration into a reproducible video file through a real worker.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Prerequisites

Tasks 10, 12, and 13 must be complete. Do not report rendering success unless an MP4 is actually produced and validated.

## Work

1. Choose a render runtime that can run FFmpeg or an equivalent media tool and document its resource limits, timeout, and storage requirements. Do not assume a serverless frontend host can render long videos.
2. Define a versioned render manifest containing scene order, image/video references, narration segments, subtitles, transitions, aspect ratio, frame rate, audio levels, title/credits, and output settings.
3. Validate that every referenced asset exists, is approved for use, and belongs to the same tenant/project before rendering.
4. Execute rendering in a durable job worker, report progress based on actual worker events, capture bounded logs, and support cancellation/retry without duplicating outputs.
5. Run QC on the actual output: file exists, non-zero size, expected duration/resolution, decodable streams, audio presence/sync, missing assets, and any configured content checks.
6. Store output in asset storage with manifest/version/checksum and link it to the project. Never overwrite an approved prior render without creating a new version.
7. Provide preview and a review status. If rendering fails or QC fails, show the specific failure and do not offer the file as ready to publish.

## Acceptance criteria

- A real render worker creates a valid playable output from actual approved assets.
- Progress reflects real worker state, not hardcoded percentages.
- QC results are stored and viewable.
- Worker limits, format assumptions, and costs are documented.

## Required handoff

Create/update:
- `docs/audits/TASK-14-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-14-HANDOFF.md`

The handoff must name the next task, but must not start it.
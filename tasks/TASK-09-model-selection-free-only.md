# TASK 09 — Implement model selection, free-only policy, and safe failover

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 8 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Allow task-specific model selection while respecting the user's no-surprise-cost requirement.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Prerequisites

Task 08 must provide the server-side provider gateway.

## Work

1. Build a provider/model registry from backend configuration and provider capabilities; do not hardcode a single model in the UI.
2. Show only providers/models that are configured and eligible for the current task. Keep the model selector explicit and explain unavailable choices.
3. Enforce `FREE_ONLY` as a server-side policy, not merely a UI preference. A provider must be marked free/eligible by trusted configuration; do not infer free status from a model name or marketing label.
4. Implement failover only among explicitly allowed free/eligible providers. Never automatically switch to paid usage. If no eligible provider remains, stop and tell the user.
5. Validate task-specific capabilities (text, image, audio, video) before dispatch. A text-only model must not be offered as an image generator.
6. Track per-tenant credits and provider usage server-side; reserve/debit atomically, prevent double charging on retries, and show estimates where available.
7. Add tests for paid-provider blocking, disabled providers, missing keys, failover order, insufficient credits, and duplicate requests.

## Acceptance criteria

- Users can select an eligible model per task.
- Server rejects requests that violate `FREE_ONLY`.
- Paid fallback is impossible without an explicit policy change/confirmation flow.
- Credit ledger and retry semantics are documented and tested.

## Required handoff

Create/update:
- `docs/audits/TASK-09-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-09-HANDOFF.md`

The handoff must name the next task, but must not start it.
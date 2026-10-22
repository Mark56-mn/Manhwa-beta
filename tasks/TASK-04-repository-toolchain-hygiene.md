# TASK 04 — Clean repository metadata and choose one supported package workflow

**Repository:** `Mark56-mn/Manhwa-beta`  
**Execution order:** 3 of the remaining 15 tasks (run in numerical order)  
**Status:** Not started

## Objective

Resolve package-manager ambiguity and remove unnecessary or misleading project metadata without breaking the current build.

## Mandatory agent rules

- Work only on a task-specific branch based on the approved roadmap branch. Never commit directly to `main`; never force-push, reset shared history, or rewrite someone else's commits.
- Before coding, read this task, the latest `docs/handoffs/` file, relevant audit docs, and the current implementation. Do not assume a feature is real because a button or label exists.
- Keep changes scoped to this task. Preserve working UI and user data; avoid broad rewrites and unnecessary dependencies.
- Never commit credentials, tokens, private keys, service-account JSON, or real customer data. Frontend code must not contain provider secrets. Do not log secrets.
- Distinguish implemented, tested, mocked, and not configured. Never claim a build/test passed unless you ran it and record the exact command and outcome.
- At completion, update/create `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-XX-HANDOFF.md`. Handoff must state changed files, decisions, tests and results, known risks, and exact next steps for the next agent.
- Do not start the next task automatically. Stop after handoff and report the branch/commit/PR and blockers.


## Work

1. Inspect `package.json`, lockfiles, scripts, runtime assumptions, and deployment config. Determine whether npm or Bun is the intended workflow; do not delete `bun.lock` or another lockfile until dependency reproducibility is checked.
2. Check whether the package name `react-example` is used externally. If safe, rename it to a meaningful private app name and update any matching metadata.
3. Review every script, especially destructive scripts such as `clean`; ensure it only deletes generated output and never source files or user data.
4. Remove only confirmed-unused dependencies and imports. Keep Recharts only if the analytics view still uses it. Do not upgrade the whole dependency tree as a shortcut.
5. Check Vercel/build configuration and environment variable names against the current app. Use placeholders only.
6. Document Node/package-manager versions and reproducible install/build commands.

## Acceptance criteria

- One documented, reproducible package installation path.
- Lockfile matches the chosen package manager and dependency manifest.
- Scripts have safe, explained effects.
- Build passes after cleanup, or exact blockers are recorded.
- No secret values are added and no unrelated visual redesign occurs.

## Required handoff

Create/update:
- `docs/audits/TASK-04-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-04-HANDOFF.md`

The handoff must name the next task, but must not start it.
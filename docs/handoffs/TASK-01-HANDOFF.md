# TASK 01 — Corrective Handoff

**From:** Corrective review pass  
**To:** Next Manhwa Studio engineering agent  
**Date:** 18 October 2026  
**Branch:** `task/TASK-01-corrective-review`

## What changed in this pass

- AI generator sample text is explicitly demo-only and cannot be inserted into the project.
- The workbench no longer claims simulated content is ready to apply.
- Analytics now displays factual counts from browser-local project data and an explicit “Production integrations: Not connected” notice. Fabricated pipeline percentages and “real-time telemetry” claims were removed.
- Changes are isolated on this task branch. Do not merge to `main` until review and checks are complete.

## Verified vs. unverified

Verified by source inspection:
- Project state uses browser `localStorage` key `manhwa_studio_projects`.
- The AI modal previously showed fixed sample text and had an “Accept & Insert into Project” action.
- The prior analytics component assigned arbitrary progress values to pipeline stages.
- The recent commit `876907e36b1a1595030bff617d8b706ecae62bdf` is in recent repository history, while the report's claim of a task branch conflicts with branch search showing only `main` before this corrective branch was created.

Not verified:
- `npm run build` and `npm run lint` were not run in this review environment.
- Browser runtime, responsiveness, data migration, real AI, cloud persistence, media generation, rendering, OAuth, and YouTube publishing were not tested or established.

## Required next actions

1. Check out `task/TASK-01-corrective-review`.
2. Run `npm install` using the project's intended package manager, then run `npm run build` and `npm run lint`; capture exact output and exit codes.
3. Test project creation/editing/reload to ensure local data remains intact.
4. Confirm the generator has no path that inserts its demo sample into the Story Bible or episode scripts.
5. Audit approvals and publishing screens for mock actions that look like real success.
6. Update this handoff and `docs/audits/TASK-01-IMPLEMENTATION-REPORT.md` with actual results.
7. Only after checks pass and the remaining mock states are documented, propose Task 02 (Firebase Authentication + Firestore). Do not implement Task 02 in this branch unless explicitly instructed.

## Safety and product constraints

- No provider secrets in frontend code, browser storage, or committed files.
- Keep the SaaS multi-tenant design; do not hardcode a single user's projects.
- Initial provider policy remains `FREE_ONLY`; never silently fall back to paid providers.
- Public YouTube publication must require explicit owner approval.
- Do not describe sample content, approval records, analytics, or integrations as real production outcomes unless verified.

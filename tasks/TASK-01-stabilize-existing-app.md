# TASK 01 — Stabilize and Solidify the Existing Manhwa Beta Application

**Repository:** `Mark56-mn/Manhwa-beta`  
**Product name:** Manhwa Studio  
**Task type:** Code audit, stabilization, and foundation hardening  
**Execution limit:** Complete this task within one agent session of approximately 60 minutes. Do not attempt to build the entire product in this task.  
**Working rule:** Inspect before changing. Preserve working UI and existing user work. No fake functionality, no hardcoded success states, and no secrets in client code.

## Objective

Take the application Google AI Studio has already generated and make its current foundation reliable. Identify what is genuinely implemented, fix high-risk issues that can be addressed safely within this task, add automated checks where practical, and leave a precise handoff for the next agent.

This is a multi-customer SaaS product from day one. Do not convert it into a personal-only application or hardcode a single user's projects, credentials, provider, or YouTube channel.

## Mandatory first steps

1. Read this task completely and inspect the current repository structure, package scripts, implementation plan, and existing handoff/task documents.
2. Inspect at minimum: `package.json`, `src/App.tsx`, `src/data/mockProjects.ts`, `src/types/manhwa.ts`, AI generator components, API-key/settings components, approval/publishing components, and Vite configuration. Adjust paths if the repository has changed.
3. Check the current Git branch and working tree. Do not overwrite uncommitted work.
4. Run the existing available checks/build before editing and record the actual output.
5. Create a short audit note distinguishing **verified working**, **partially implemented**, **mock/demo only**, and **not implemented / not verified**. Do not infer success from the appearance of a UI component.

## Scope for this task

### A. Preserve and stabilize the current UI

- Preserve useful dashboard, project, story bible, episode editor, production, and approval components.
- Fix concrete build errors, broken imports, TypeScript errors, runtime crashes, and obvious navigation problems discovered during the audit.
- Avoid a full redesign or unrelated refactor.
- Keep sample data visibly marked as demo/sample data. Do not display sample records as real production events.

### B. Establish honest operation states

- Identify all mock data, fake progress, hardcoded provider responses, simulated agents, and placeholder integrations.
- Clearly label demonstration functionality as **Demo** or **Not connected**.
- Never report a task, provider connection, media generation, upload, or publication as successful unless a real operation has succeeded and its result has been verified.
- Replace misleading success states with explicit statuses such as `not_configured`, `demo`, `pending`, `running`, `succeeded`, `failed`, or `waiting_for Approval`, as appropriate.
- Do not claim that agents are autonomously cooperating unless a real orchestration/task implementation exists.

### C. Remove unsafe client-side credential handling

- Search for API keys, tokens, credentials, and provider secrets in frontend code, browser storage, demo data, and logs.
- In particular, inspect any use of `localStorage` for Gemini/provider keys (including `manhwa_gemini_key`).
- Do not store application-owned provider secrets in `localStorage`, session storage, frontend environment variables, source files, or client-visible configuration.
- Remove direct client-side use of application-owned provider secrets.
- If there is no backend yet, disable the unsafe live call and show a clear “backend/provider not configured” state rather than inventing a backend or pretending generation works.
- Do not print secrets in logs or task reports. Do not commit credentials.
- Do not silently collect or expose a customer's own provider credentials. If bring-your-own-key support is later implemented, design it separately with explicit user consent and secure server-side handling.

### D. Make local persistence behavior honest

- Audit project persistence and identify where browser `localStorage` is currently used.
- Do not present browser-local storage as cloud synchronization or multi-device persistence.
- If cloud persistence is not yet configured, clearly communicate that data is currently local/demo-only and preserve existing user data during the transition.
- Do not introduce Firebase dependencies or production database writes blindly in this task.
- Never erase existing projects or overwrite real user data during cleanup.

### E. Add practical verification

- Run the repository's existing lint, typecheck, test, and production build scripts when present.
- Add or repair small, relevant tests if the existing setup supports them without major dependency changes.
- Verify at minimum: app build, project/story types compile, demo mode is labelled honestly, and provider secrets are not read from client storage or exposed by frontend code.
- Record each command and its result. If a command cannot run, state why; do not claim it passed.
- Do not add broad new dependencies without a clear need.

## Product rules that must not be violated

1. **Multi-customer SaaS from the beginning.** No personal-only assumptions.
2. **Provider abstraction is a future required architecture.** Do not hardcode the whole product to Gemini or one permanent vendor.
3. **FREE_ONLY is the initial cost policy.** No automatic paid fallback. If no eligible free provider is available, pause and explain.
4. **Free plan:** 100 credits, usable only for story writing, story bible work, and scripts. Image generation, voice generation, and video rendering are excluded from this free allowance.
5. **Customer API credentials must not be exposed.** Never show application-owned API keys in customer settings.
6. **Human approval gates are real.** Public YouTube publication must require explicit owner approval. A mock approval button is not a real publishing integration.
7. **Persistent story bible is a core requirement.** Preserve story, character, world, episode, scene, asset, continuity, and decision history in the future persistent architecture.
8. **Durable background tasks are required.** Long-running work must not depend on the browser tab remaining open.
9. Never fabricate completed image, voice, rendering, provider, database, or YouTube integrations.

## Out of scope for Task 01

Do not attempt to implement all Firebase integration, the full Director/agent orchestration system, real image/voice generation, a video-rendering worker, subscription billing, or YouTube publishing in this task. Document these as follow-up work with concrete dependencies.

Do not change hosting providers, deploy to production, rotate/delete secrets, alter account settings, or publish any video.

## Acceptance criteria

This task is complete only when:

- [ ] The existing project structure and prior work have been inspected.
- [ ] The baseline build/check results are recorded.
- [ ] Any concrete build/runtime defects fixed in scope are documented.
- [ ] Demo/mock functionality is clearly distinguished from live functionality.
- [ ] No application-owned AI secret is stored/read from browser storage or exposed in frontend code.
- [ ] Local-only storage is not misrepresented as cloud persistence.
- [ ] Available tests/typechecks/build are run and results recorded accurately.
- [ ] No real user projects are deleted or overwritten.
- [ ] A task report and handoff document are committed with the changes.
- [ ] Changes are made on a task branch, not directly on `main`, unless repository policy explicitly requires otherwise.
- [ ] The final response lists changed files, commands/results, known gaps, commit SHA, and the exact next task.

## Required documentation output

Create/update:

- `tasks/TASK-01-stabilize-existing-app.md` — copy or refine this task as the durable task definition if it does not already exist.
- `docs/audits/TASK-01-IMPLEMENTATION-REPORT.md` — actual audit findings, files changed, checks run, results, and known issues.
- `docs/handoffs/TASK-01-HANDOFF.md` — instructions for the next agent, what was changed, what remains, risks, and the recommended next task.

Do not duplicate files if an equivalent canonical location already exists; update the canonical task/report/handoff instead.

## Next task after completion

**SUPERSEDED (20 October 2026):** The Firebase foundation described below no longer matches the agreed architecture. Per the consolidated blueprint the sequence is now **Cloudflare Worker/Hono + D1/R2 tasks** (see `tasks/ROADMAP-RECONCILIATION.md`), not Firebase/Firestore. Do not implement Firebase unless the owner explicitly changes the architecture decision.

The immediate next step after this verification/handoff is to **record the actual results here** and **leave an accurate handoff**, not to start a foundation task until the owner confirms the next committed work.

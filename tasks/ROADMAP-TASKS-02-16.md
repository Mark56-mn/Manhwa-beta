# Manhwa Studio — 15-task engineering plan (Tasks 02–16)

**Repository:** `Mark56-mn/Manhwa-beta`  
**Roadmap branch:** `plan/manhwa-studio-15-task-roadmap`  
**Baseline:** corrective Task 01 work is in draft PR #1; it is not merged. Runtime checks have not yet been independently verified.

## How to execute

Run these tasks **in order**, one at a time. Task 02 begins with work still outstanding from stabilization; it does not assume the corrective patch is complete. Do not start later tasks until the current task's acceptance criteria and handoff are reviewed. Every task file contains scope, prerequisites, and acceptance criteria.

- [ ] **Task 02 — Finish Task 01 verification and resolve stabilization gaps:** `tasks/TASK-02-finish-task-01-verification.md`
- [ ] **Task 03 — Audit and neutralize misleading mock states across the app:** `tasks/TASK-03-audit-mock-success-states.md`
- [ ] **Task 04 — Clean repository metadata and choose one supported package workflow:** `tasks/TASK-04-repository-toolchain-hygiene.md`
- [ ] **Task 05 — Add a minimal automated test and quality gate:** `tasks/TASK-05-test-quality-gates.md`
- [ ] **Task 06 — Implement Firebase Authentication foundation:** `tasks/TASK-06-firebase-auth-foundation.md`
- [ ] **Task 07 — Design tenant-safe Firestore data model and migrate project persistence:** `tasks/TASK-07-firestore-multitenant-data.md`
- [ ] **Task 08 — Build a server-side AI provider gateway:** `tasks/TASK-08-server-side-ai-gateway.md`
- [ ] **Task 09 — Implement model selection, free-only policy, and safe failover:** `tasks/TASK-09-model-selection-free-only.md`
- [ ] **Task 10 — Create durable agent task queue and orchestration state machine:** `tasks/TASK-10-durable-agent-orchestration.md`
- [ ] **Task 11 — Connect real story generation to the persistent Story Bible:** `tasks/TASK-11-story-generation-story-bible.md`
- [ ] **Task 12 — Add real image and narration provider adapters:** `tasks/TASK-12-image-voice-provider-adapters.md`
- [ ] **Task 13 — Implement secure asset storage and lifecycle management:** `tasks/TASK-13-asset-storage-lifecycle.md`
- [ ] **Task 14 — Build real video assembly and quality-control pipeline:** `tasks/TASK-14-video-rendering-qc.md`
- [ ] **Task 15 — Implement explicit approval workflow and publication gate:** `tasks/TASK-15-approval-workflow.md`
- [ ] **Task 16 — Integrate YouTube OAuth and gated upload workflow:** `tasks/TASK-16-youtube-oauth-publishing.md`

## Dependency map

- **02–05:** finish stabilization, remove misleading mock states, settle package workflow, add test gates.
- **06–07:** real authentication, tenant-safe cloud persistence and safe local-data migration.
- **08–09:** server-side AI gateway, selectable providers/models, free-only policy and credits.
- **10–11:** durable multi-agent task orchestration and real Story Bible generation.
- **12–14:** image/voice adapters, secure asset storage, real video rendering/QC.
- **15–16:** auditable approval gates and secure YouTube OAuth/upload.

## Global non-negotiables

1. No secrets in frontend bundles, browser storage, committed files, or logs.
2. Tenant isolation must be enforced server-side and in security rules.
3. No fake AI, storage, approval, rendering, or publishing success.
4. Initial model policy is `FREE_ONLY`; never fall back to a paid provider automatically.
5. Public YouTube publishing requires explicit owner approval for the exact rendered version.
6. Preserve existing user data; migrations must be reversible or backed up.
7. Each completed task must update its audit report and handoff. Report exact commands/results; do not claim unrun checks passed.
8. Keep work on task-specific branches. Never force-push, reset shared history, or commit directly to `main`.
9. If a prerequisite is blocked, document the blocker and stop rather than creating a fake implementation.

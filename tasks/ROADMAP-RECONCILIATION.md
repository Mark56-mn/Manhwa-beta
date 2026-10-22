# Roadmap Reconciliation — Authoritative Task Sequence

**Purpose:** The repository contains, or will contain, task files from two different planning eras.
This file records which sequence is authoritative for agents working in this repository.

**Source of truth:** The consolidated Freebuff implementation blueprint (owner-provided; documentation PR #3
proposes a copy at `docs/MANHWA-STUDIO-CONSOLIDATED-BLUEPRINT.md`).

## Current execution roadmap (22 October 2026)

The owner's **`Manhwa_Beta_14_Task_Roadmap.md`** (14 tasks, prepared 22 October 2026) is the authoritative
execution sequence from ROADMAP TASK 01 onward. The Phase 0–4 table further down is the **historical
record** of the repo `TASK-NN` files those 14 tasks build on — read it as provenance, not as the current
plan. Where the two disagree, the 14-task roadmap wins.

### Roadmap ↔ repository task mapping

Repo `TASK-NN` numbers are **not** roadmap numbers. The same number can mean unrelated work (repo
TASK 12 = R2 asset routes; roadmap TASK 12 = exact-version owner approval).

| Roadmap task | Repo work that satisfies or precedes it | State (22 Oct 2026) |
|---|---|---|
| 01 Reconcile branches and repair CI | `ROADMAP-TASK-01`; integrates repo TASK 02–07 and 12 into `task/TASK-01-reconcile-ci` | **done locally** (all 4 gates exit 0); hosted CI removed by owner decision; branch unmerged |
| 02 Reconcile roadmap and documentation | `ROADMAP-TASK-02` (this document set) | **done**; documentation-only |
| 03 Authentication + prove tenant isolation | repo TASK 07 (Worker auth mount, `user.sub` identity, D1 isolation primitives + `tests/tenancy.test.ts`) | `implemented-not-verified`; blocked on owner registering the Freebuff OIDC client |
| 04 API contracts + durable job state machine | — | `planned` |
| 05 Server-side AI gateway, FREE_ONLY | — | `planned` |
| 06 100-credit free plan + usage ledger | — | `planned` |
| 07 Persist projects / Story Bible in D1 | repo TASK 07 created the tenancy schema only; no project CRUD endpoints and the UI still uses `localStorage` | `planned` |
| 08 Director agent + durable orchestration | — | `planned` |
| 09 Image generation + asset lifecycle | repo TASK 12 = R2 storage half only (upload/read/delete, org-scoped) | storage `implemented-not-verified`; generation `planned` |
| 10 Narration / voice generation | — | `planned` |
| 11 Video assembly + QC | — | `planned` |
| 12 Review + exact-version owner approval | — (repo TASK 12 is unrelated: name collision) | `planned` |
| 13 YouTube OAuth, upload, verification | — | `planned` |
| 14 Deploy, end-to-end test, controlled launch | — (no Worker deployment exists) | `blocked` — needs owner authorization and credentials |

Reverse mapping, for anyone reading a repo report: repo TASK 01–05 are **Phase 0 prerequisites** (PR #1
stabilization, verification, mock audit, toolchain hygiene, quality gates) that roadmap TASK 01
consolidates; repo TASK 06/07/12 are the early Cloudflare foundation that roadmap TASK 03/09 extend.

### Architecture flow (compact)

```text
React SPA (Vite, static build)           <- today: localStorage only, zero network calls
   |  same-origin fetch, after sign-in
   v
Hono Worker on Cloudflare               <- today: implemented, never deployed
   |  verify session server-side, derive tenant from user.sub
   +--> D1   metadata: organizations, users, memberships, projects, jobs, credits, approvals
   +--> R2   media bytes, referenced by D1 asset rows
   |
   v
Provider adapters (FREE_ONLY allow-list, keys server-side only)
   |
   v
Exact-version owner approval (bound to artifact + metadata hashes)
   |
   v
YouTube publish, verified by querying YouTube
```

Only the first two boxes exist in code; the arrow between them is **not wired**.

### Documentation naming convention (canonical)

- Roadmap task output: `docs/audits/ROADMAP-TASK-NN-IMPLEMENTATION-REPORT.md` and
  `docs/handoffs/ROADMAP-TASK-NN-HANDOFF.md`.
- Branch per task: `task/TASK-NN-short-name`.
- `docs/audits/TASK-NN-*` and `docs/handoffs/TASK-NN-*` without the `ROADMAP-` prefix are **historical
  Phase 0 records**; they are corrected with dated notes, never rewritten.
- Every handoff follows the 9-point format in the 14-task roadmap (`Task ID/status`, `branch + SHA`,
  `files`, `commands + results`, `tests`, `known issues`, `env var names + owner actions`,
  `deployed vs documented`, `next task`).

## Conflicting artifacts (do not execute blindly)

| Artifact | State | Problem |
|---|---|---|
| `tasks/TASK-01-stabilize-existing-app.md` § "Next task after completion" | in `main` | says Task 02 = Firebase Auth + Firestore |
| `docs/handoffs/TASK-01-HANDOFF.md` (original) | in `main` | instructs Firebase Foundation for Task 02 |
| PR #2 `tasks/ROADMAP-TASKS-02-16.md` + 15 task files | open/draft/**unmerged** | entire sequence built on Firebase/Firestore |

## Authoritative sequence (consolidated blueprint, Phase 0–4)

| Task | Title | Platform foundation |
|---|---|---|
| TASK 02 | Finish Task 01 verification | existing app only |
| TASK 03 | Audit all mock and fake-success states | existing app only |
| TASK 04 | Repository/toolchain hygiene | existing app only |
| TASK 05 | Automated quality gates | existing app only |
| TASK 06 | Cloudflare backend foundation (Worker/Hono, env & secret conventions, health endpoints) | Cloudflare |
| TASK 07 | Authentication, tenant isolation, D1 data foundation (Freebuff/OIDC + D1 migrations) | Cloudflare D1 + OIDC |
| TASK 08 | API contracts and persistent job model | Cloudflare |
| TASK 09 | Server-side AI provider gateway | server-only adapters |
| TASK 10 | Model selection and FREE_ONLY policy | server-only adapters |
| TASK 11 | Story Bible, episode planning, real script generation + 100-credit ledger | D1 + gateway |
| TASK 12 | Image generation and asset metadata (R2) | Cloudflare R2 |
| TASK 13 | Voice/audio and asset storage | configured provider |
| TASK 14 | Video rendering and quality control | rendering worker |
| TASK 15 | Director/Showrunner orchestration and end-to-end workflow | durable jobs |
| TASK 16 | Approval Center, YouTube OAuth, gated publishing | server-side OAuth |

**Replaced tasks:** the old "Firebase Authentication" and "Firestore persistence" tasks are **removed from
the sequence**. Do not implement Firebase/Firestore unless the owner explicitly changes the architecture.

## Rules

1. Read the most recent `docs/handoffs/` file before starting any task.
2. Re-check each task file against this table before treating it as executable.
3. One task at a time; stop after writing the implementation report and handoff.
4. Never commit to `main` without explicit owner authorization; use `task/TASK-XX-...` branches.
5. PRs #1–#3 must be re-checked for status before relying on their contents.

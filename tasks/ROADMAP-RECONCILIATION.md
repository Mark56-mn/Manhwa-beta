# Roadmap Reconciliation — Authoritative Task Sequence

**Purpose:** The repository contains, or will contain, task files from two different planning eras.
This file records which sequence is authoritative for agents working in this repository.

**Source of truth:** The consolidated Freebuff implementation blueprint (owner-provided; documentation PR #3
proposes a copy at `docs/MANHWA-STUDIO-CONSOLIDATED-BLUEPRINT.md`).

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

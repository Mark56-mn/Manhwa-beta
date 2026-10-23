# TASK 04 — Persistent story generation and the 100-credit free tier

**Product:** Manhwa Studio (Manhwa Beta) · **Repo:** `Mark56-mn/Manhwa-beta`
**Branch:** `task/TASK-04-PERSISTENT-STORY-GENERATION`
**Base:** `3e26b77a12f517f775da212bc0e6e580f8d020cf` (verified Task 03 tip)
**Date:** 23 October 2026
**Report:** [`docs/audits/TASK-04-PERSISTENT-STORY-GENERATION-REPORT.md`](../docs/audits/TASK-04-PERSISTENT-STORY-GENERATION-REPORT.md)
**Handoff:** [`docs/handoffs/TASK-04-PERSISTENT-STORY-GENERATION-HANDOFF.md`](../docs/handoffs/TASK-04-PERSISTENT-STORY-GENERATION-HANDOFF.md)

## Objective

Deliver the first complete customer-facing workflow on the existing Worker/D1 backend: create a
tenant-scoped project, generate a Story Bible and an episode script through a real server-side AI
provider, persist and retrieve every version, track durable generation jobs, and enforce a
server-owned 100-credit free plan.

## Verified starting state

- Branch tip/remote agree at `3e26b77`; `origin/main` is `49ed52c` and is not merged.
- Identity: `worker/src/identity.ts` (verified SDK session only). Projects/assets routes are
  tenant-scoped; CSRF/CORS hardening is in place; 189 tests pass.
- **No AI adapter or provider key exists**; `.env.example` documents `GEMINI_API_KEY` only.
- No credit, job, Story Bible or episode tables/routes exist.
- No live OIDC client, deployment, or Supabase project is configured in this environment.

## Delivered in this task

1. Additive migration `0003_story_generation.sql` (not applied): project profiles, story bibles,
   episodes, generation jobs, credit accounts/holds/ledger, indexes and constraints.
2. Tenant-scoped API: project profile fields, Story Bible read/save with versions, episode read/approve,
   generation jobs, credits summary/history.
3. Server-side Gemini adapter (server key only, bounded timeout/output, typed failures, no silent
   fallback). Missing `GEMINI_API_KEY`/`GEMINI_MODEL` = truthful `provider_not_configured`.
4. Exactly-once 100-credit grant per organization, atomic reservations, settlement, release, ledger,
   no negative balance, media feature rejection for the free plan.
5. Synchronous but durable generation jobs (`pending` → `running` → `succeeded`/`failed`) with
   idempotency, one bounded attempt, and honest `provider_not_configured` / failure states. **No
   scheduler is added.**
6. Story Studio UI inside the existing Project Hub, clearly separate from browser-local drafts.
7. Integration tests against the real router and SQLite schema; provider tests with injected fetch;
   frontend client/state tests; report and handoff.

## Credit costs (fixed, server-owned)

| Operation | Cost |
|---|---|
| Story Bible generation | 10 credits |
| Episode script generation | 15 credits |

Media types (`image`, `voice`, `video`) are rejected for the free plan before any job or charge.

## Out of scope / prohibited without owner approval

- Deploying, merging, applying migrations, registering callbacks, enabling GitHub Actions.
- Scheduling/background execution, YouTube publishing, image/voice/video generation.
- Supabase writes or a second database/identity provider.
- Live verification claims without a real OIDC client and provider key.

## Verification

`bun install --frozen-lockfile`, `bun run lint`, `bun run test`, `bun run build`, `git diff --check`,
plus deterministic tests for persistence, tenant isolation, credits, jobs, provider failures and frontend
error handling. Live generation and live auth remain **BLOCKED/UNVERIFIED** without credentials.

## Done criteria

- The complete code path exists and is tested end-to-end against the real router/schema with an injected
  provider.
- No fabricated success, no client-supplied balance/tenant/plan, no negative balance, no double charge.
- All gates pass; report and handoff document blockers, migrations, contracts and the exact next task.

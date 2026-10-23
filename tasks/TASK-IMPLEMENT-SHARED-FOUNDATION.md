# TASK — Implement the shared application foundation

**Product:** Manhwa Studio (Manhwa Beta) · **Repo:** `Mark56-mn/Manhwa-beta`
**Branch:** `task/TASK-IMPLEMENT-SHARED-FOUNDATION` (from `905bf57`, the `task/TASK-01-reconcile-ci` tip)
**Date:** 23 October 2026
**Report:** [`docs/audits/IMPLEMENT-SHARED-FOUNDATION-REPORT.md`](../docs/audits/IMPLEMENT-SHARED-FOUNDATION-REPORT.md)
**Handoff:** [`docs/handoffs/TASK-IMPLEMENT-SHARED-FOUNDATION-HANDOFF.md`](../docs/handoffs/TASK-IMPLEMENT-SHARED-FOUNDATION-HANDOFF.md)

## Objective

Move Manhwa Beta from documentation and prototypes to a working multi-tenant SaaS
foundation **without creating a second backend**: one typed frontend client, one
tenant-scoped projects API on the existing Worker/D1, one coherent authentication
path, and a safe secondary-backup design.

## Architecture target (binding decisions from the owner)

1. The Freebuff-hosted Worker is the proposed single API backend.
2. Freebuff-managed D1 is the proposed primary database.
3. Supabase Auth is the desired shared identity provider.
4. Supabase Postgres is a secondary backup only, never a competing primary.
5. Vercel and Freebuff host two instances of the same frontend build.
6. Both frontends use the same authoritative API, identities, projects and assets.
7. No second API and no second independent job processor.
8. Do not assume Freebuff OIDC is Supabase Auth; one strategy at a time.
9. Same-origin proxy where possible; otherwise an explicit allow-listed API origin,
   never wildcard credentialed CORS and never a weakened mutation guard.
10. Do not attempt to make a host-only cookie work across unrelated domains.

## Delivered in this task

| Deliverable | What exists now |
|---|---|
| Frontend ↔ backend slice | `src/lib/api.ts` (one typed client), `src/lib/cloudWorkspace.ts` (state machine), `src/components/CloudWorkspacePanel.tsx` (list/create cloud projects, honest loading/empty/success/error states) mounted in `ProjectHub`. |
| Server | `worker/src/projects.ts` with GET/POST/PATCH/DELETE scoped to the session tenant; `worker/src/identity.ts` (single verification path); `worker/src/origins.ts` (exact allow-list + preflight); `worker/src/tenancy.ts`. |
| Auth/tenant isolation | 401/403/503 gates, server-derived `user.sub`, all SQL scoped by `organization_id`, cross-tenant reads/writes/deletes answered 404 with rows unchanged, tests for Tenant A vs Tenant B. |
| Database readiness | Read-only comparison in the report; `migrations/0002_assets_and_replication.sql` (not applied) reconciles the missing `assets` table and adds outbox/state tables. |
| Backup readiness | `worker/src/replication.ts` (retries, idempotency, last-success marker), `worker/src/supabaseBackup.ts` (PostgREST adapter, no live target), tests. No scheduler wired. |

## Explicitly out of scope

- Deploying, merging to `main`, applying migrations, registering OIDC callbacks.
- Implementing Supabase Auth itself (no project/credentials; migration path documented).
- Scheduling the replication job (migration 0002 is unapplied, so the outbox does not exist live yet).
- Rewriting the creator UI or converting existing local project data to the server.
- GitHub Actions.

## Done criteria

- One real frontend→backend workflow implemented with accurate states.
- Tenant boundaries enforced server-side and tested.
- Database untouched; additive migration committed but unapplied.
- `bun install --frozen-lockfile`, `lint`, `test`, `build`, `git diff --check` pass.
- Report + handoff written; next agent can continue without repeating the investigation.

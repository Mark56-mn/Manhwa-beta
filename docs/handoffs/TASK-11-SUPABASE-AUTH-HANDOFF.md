# TASK 11 handoff — Supabase Auth

**Branch:** `task/TASK-11-SUPABASE-AUTH` · **Base:** `main` at the time of branching
**Read first:** [`docs/audits/TASK-11-IMPLEMENTATION-REPORT.md`](../audits/TASK-11-IMPLEMENTATION-REPORT.md),
then [`docs/audits/TASK-11-SUPABASE-AUTH-PLAN.md`](../audits/TASK-11-SUPABASE-AUTH-PLAN.md) (the
inspected plan this implements).

## State

Code complete for the agreed scope: Worker verifies Supabase access tokens, the browser owns the
session (register / sign in / sign out / restore / reset), Freebuff OIDC is removed and its routes
answer `410`, provisioning accepts UUID subjects unchanged, and no migration was added.

Verified locally: frozen install, typecheck/lint, `bun test --isolate` (**406 pass / 0 fail**),
`bun run build`, and a `dist/` secret scan. **Nothing was deployed, migrated, or configured in
production.** Live sign-in is unverified because no Supabase project exists for this repository.

## The five owner actions, in order

1. **Create the Supabase project** (free tier is enough). Copy the project URL and the
   **publishable** key — never the service-role key.
2. **Configure Auth → URL Configuration:** Site URL = the frontend origin;
   Redirect URLs = that origin and `/<path>` used for recovery (at minimum the bare origin).
   Decide whether email confirmation stays on (default). If it stays on, expect
   "confirmation required" after registration, not an immediate session.
3. **Vercel → Environment Variables (Production + Preview):**
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_BASE_URL` (the Worker
   origin). All three are public; redeploy — these are build-time values.
4. **Worker `[vars]`:** `SUPABASE_URL` (bare origin), `APP_ORIGIN` (the Worker's own origin),
   `ALLOWED_ORIGINS` (the Vercel production origin and any preview origin actually used).
   No auth callback is registered on the Worker any more. **No new migration is needed.**
5. **Deploy the Worker, then verify:**
   `node scripts/verify-deployment.mjs --api https://<worker> --origin https://<frontend> --frontend <url>` —
   check 4 now also asserts `authorization` is advertised in the preflight.

Then the only proof that matters: register, confirm, sign in, create one cloud project, reload,
confirm it persists. That has **not** been done by an agent.

## What a next agent must not do

- Do not merge into `main`, deploy the Worker, apply remote migrations, or register production
  auth clients without explicit owner authorization.
- Do not touch `migrations/0002_assets.sql` — it is untracked, owner-owned, and no longer read by
  wrangler (`migrations_dir = "db/migrations"`).
- Do not "fix" sign-in by email-matching old Freebuff users onto new Supabase identities. That is
  the account-takeover path the schema deliberately forbids.
- Do not add a service-role key to any `VITE_` variable; the client rejects it at runtime, and a
  test asserts that rejection.

## Known gaps worth a follow-up task

1. **Password recovery completion UI.** The reset request is wired and `detectSessionInUrl` +
   PKCE exchange is configured, but there is no screen that reads the recovery session and calls
   `updateUser({ password })`. `changePassword()` exists in `src/lib/authSession.ts` and is tested;
   only the UI is missing. Until then, a recovery link signs the user in without offering a new
   password form.
2. **Live verification** of `/api/v1/me`, tenancy provisioning, and cross-origin bearer calls
   against a deployed Worker + real Supabase token.
3. **Token lifetime policy.** Defaults are Supabase's; document the chosen access-token TTL and
   refresh interval once the project exists.
4. `docs/DEPLOYMENT.md` and `docs/DEPLOYMENT-VERCEL.md` were updated for the new topology; the
   historical TASK 08/10 reports still describe the Freebuff era and are intentionally left as
   evidence.

# TASK 11 handoff — Supabase Auth (plan stage)

**Branch:** `task/TASK-10-DEPLOYMENT-REVIEW` @ `eade008`
**State:** inspection and plan only. No code, dependency, migration, secret or
production setting was changed.
**Full report:** `docs/audits/TASK-11-SUPABASE-AUTH-PLAN.md`

## What was done

- Read the entire current auth path: `worker/src/auth.ts`,
  `worker/src/identity.ts`, `worker/src/index.ts`, `worker/src/origins.ts`,
  `worker/src/projects.ts|story.ts|assets.ts`, `worker/src/tenancy.ts`,
  `worker/src/provisioning.ts`, `src/lib/api.ts`, `src/lib/cloudWorkspace.ts`,
  `src/components/CloudWorkspacePanel.tsx`, `db/migrations/0001_init_tenancy.sql`,
  `package.json`, `wrangler.toml`, `vercel.json`, `.env.example`, and the eight
  test files that touch auth.
- Identified eight compatibility problems, two of which change the design
  rather than the code (CORS header allow-list; cookie vs Bearer transport).
- Confirmed **no migration is needed** for Supabase subjects and that the
  untracked `migrations/0002_assets.sql` is untouched (sha256 `e28317fa1ccc30d8…`).

## Things the next agent must not get wrong

1. `ALLOWED_REQUEST_HEADERS` in `worker/src/origins.ts` must gain
   `Authorization`, or every cross-origin authenticated call dies at preflight.
2. Supabase puts the session in `localStorage`. `src/lib/api.ts` currently
   promises "no token in browser storage"; that sentence and the matching
   honesty test must change in the same commit — do not leave a false claim.
3. Verify ES256 against the JWKS with an explicit `algorithms` list; never
   accept `alg: none` or an algorithm taken from the token header; never use
   `service_role` for verification.
4. `iss` trailing-slash spelling differs historically — normalise and test both.
5. Do not link old Freebuff `sub`s to Supabase identities by email. The schema
   forbids email lookups for a reason (P6 in the report).
6. Provisioning and tenancy need **no logic change**; only the resolver import.
7. Keep the `503 auth_not_configured` contract — it is what makes an
   unconfigured deployment honest instead of half-working.

## Blocked on

- Owner decisions: transport model, whether to retire Freebuff, `sub` handling,
  approval for `jose` + `@supabase/supabase-js`.
- Owner configuration: Supabase project, Site URL/redirect allow-list, email
  confirmation policy, Vercel variables, Worker `SUPABASE_URL`.

## Next action

Obtain answers to §10 of the report, then implement in this order:
backend verifier + CORS header → identity mapping → frontend client/panel →
test updates and new suites → docs. Run `tsc`, `lint`, `test`, `build`,
`migrations:check`, the bundle secret scan, and the Worker dry-run before any
deployment is discussed.

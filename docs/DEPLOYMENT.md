# Deployment & Rollback — Manhwa Studio API Worker

**Status (re-verified 27 October 2026, TASK 08):** D1 `manhwa-studio` and R2 `manhwa-studio-assets` exist
on the owner's account and **match `wrangler.toml`**; migration **`0001` is applied remotely** and every
table is empty. The Worker has **never been deployed** (the account's script list is empty and it has no
`workers.dev` subdomain), but it **bundles cleanly** for workerd. The one published Manhwa backend is the
owner's **Freebuff-hosted site**, which runs a **~40-commit stale** revision of this Worker and is
**non-authoritative**. Full evidence and the recommendation:
[`docs/audits/TASK-08-BACKEND-RECOVERY-REPORT.md`](audits/TASK-08-BACKEND-RECOVERY-REPORT.md).

## What exists today (verified live, 27 Oct 2026)

| Piece | State |
|---|---|
| `wrangler.toml` + `worker/src/` (Hono API) | in repo; bundles with `wrangler deploy --dry-run` → **192.20 KiB / gzip 44.12 KiB**; bindings resolved to `env.DB` (D1 `manhwa-studio`) and `env.FILES` (R2 `manhwa-studio-assets`) |
| Cloudflare API token | **valid** — account read, Workers scripts list, D1 list/query, R2 list and zones all succeeded. Values are never printed; loaded from the gitignored `.env.local` |
| D1 database `manhwa-studio` | **exists** — `d9557398-b439-463a-b5aa-a3703d5c3fdb`, WNAM, 111 kB, `num_tables 7`. `d1_migrations` contains **only `0001_init_tenancy.sql`**. Tables: `organizations`, `users`, `organization_memberships`, `projects`, `audit_events`, `assets`, `d1_migrations`. Rows: **0 / 0 / 0** — no production data yet |
| R2 bucket `manhwa-studio-assets` | **exists** (created 2026-10-19), 0 bytes used, bound as `FILES` |
| Identity | **Supabase Auth** since TASK 11 (Freebuff OIDC retired; `/auth/freebuff/*` now answers `410 auth_moved`). The Worker verifies a bearer access token against the project's JWKS. **No Supabase project is configured in this environment**, so `/readyz` reports `auth: not_configured` and protected routes answer `503` |
| Worker deployment (owner's account) | **none** — `GET /accounts/…/workers/scripts` → `[]`; **no `workers.dev` subdomain** (error 10007) |
| Freebuff-hosted deployment | **published and up** (`site-ad1c9222…freebuff.page`) but **stale**: no `/api/v1/projects` (404), no CORS headers, no frontend assets. Preview environment has never been deployed |
| Frontend | **live on Vercel** at <https://manhwa-beta.vercel.app>, but built with **no `VITE_API_BASE_URL`** — it is disconnected by construction and says so |

## Prerequisites

- Bun ≥ 1.4 (see `README.md`).
- `.env.local` populated via `bash scripts/store-secrets.sh` (gitignored, mode 600).
- Owner authorization — deployment is never performed automatically.

## Migration chain: resolved by configuration (TASK 10)

`wrangler.toml` sets `migrations_dir = "db/migrations"`, so the chain wrangler applies is exactly the three
tracked files. The untracked `migrations/0002_assets.sql` — a bare `CREATE TABLE assets` that used to sort
first and abort the whole apply with `table assets already exists` — is **still in the repository,
untouched, and is no longer read by wrangler**. Do not delete it, and do not point `migrations_dir` back at
`migrations/` while it is there. Verified: `wrangler d1 migrations list --remote` shows only
`0002_assets_and_replication.sql` and `0003_story_generation.sql` pending.

Verify the chain statically first — this touches no database, remote or local:

```bash
bun run migrations:check        # exit 0 = safe to apply; exit 1 = a blocker, printed with remediation
```

It exits **0** today; it also prints a note listing any `.sql` files left in the legacy `migrations/`
directory. Never apply a chain the preflight rejects.

`migrations/0002_assets.sql` is an **untracked duplicate** of the tracked
`0002_assets_and_replication.sql`. It contains a bare `CREATE TABLE assets` while the live database
already has an `assets` table, it sorts first, and wrangler **aborts at the first failure** — leaving
`0002`/`0003` unapplied. Reproduced locally:

```
✘ [ERROR] table assets already exists at offset 268: SQLITE_ERROR
```

## Deploy procedure (requires authorization)

```bash
export PATH="$HOME/.bun/bin:$PATH"

# 1. Load the operator credential WITHOUT printing it:
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)

# 2. Group 1 — read-only verification (safe):
bun run migrations:check                                    # must exit 0 before Group 4
bunx wrangler whoami
bunx wrangler d1 migrations list manhwa-studio --remote     # expect 3 pending, incl. the stray 0002
bunx wrangler d1 time-travel info manhwa-studio             # restore point (verified available 27 Oct 2026)
bunx wrangler deploy --dry-run --outdir=/tmp/dryrun         # local bundle; uploads nothing

# 3. Group 2 — local rehearsal on the disposable local database:
bunx wrangler d1 migrations list manhwa-studio --local --persist-to /tmp/rehearsal   # 3 tracked files
CI=true bunx wrangler d1 migrations apply manhwa-studio --local --persist-to /tmp/rehearsal
#   (apply has no --yes flag; CI=true plus a TTY or piped confirmation is required)

# 4. Group 3 — reversible configuration:
#    add to wrangler.toml [vars]: SUPABASE_URL, APP_ORIGIN, ALLOWED_ORIGINS
#    SUPABASE_URL is a bare origin: https://<project>.supabase.co  (a path => auth_not_configured)
#    No auth callback is registered on the Worker any more: sign-in happens in the
#    browser. In the Supabase dashboard set Site URL + Redirect URLs to the
#    frontend origin(s) so confirmation and reset emails return correctly.
bunx wrangler secret put GEMINI_API_KEY      # optional; typed interactively, never in a flag or chat
bunx wrangler secret put GEMINI_MODEL        # optional; both are required together

# 5. Group 4 — OWNER AUTHORIZATION REQUIRED (production-impacting):
bunx wrangler deploy                                        # first deploy; creates the script
bunx wrangler d1 migrations apply manhwa-studio --remote    # additive DDL; no down-migration exists
curl -s https://<origin>/healthz                            # {"status":"ok"}
curl -s https://<origin>/readyz                             # ready + per-dependency detail
node scripts/verify-deployment.mjs --api https://<origin> --origin https://<frontend origin> --frontend <url>
```

The verifier performs **GET/OPTIONS only** and must exit 0 before a deployment is called working. The
frontend side (`VITE_API_BASE_URL`, Vercel settings) is documented in
[`docs/DEPLOYMENT-VERCEL.md`](DEPLOYMENT-VERCEL.md).

**Hostname:** the account has no `workers.dev` subdomain yet — open Workers & Pages once to create it, or
attach a custom domain. `oppa-technologies.online` is active on this account, so
`manhwa-api.oppa-technologies.online` is available at no separately listed cost.

## Bindings

- **D1 (`DB`)** — `manhwa-studio`, `d9557398-b439-463a-b5aa-a3703d5c3fdb`, WNAM. `0001_init_tenancy.sql`
  applied. New migrations: add `db/migrations/000N_*.sql` (the `migrations_dir` chain), then
  `bunx wrangler d1 migrations apply manhwa-studio --local` and (authorized) `--remote`.
  `/readyz` hard-gates on a real `SELECT 1`.
- **R2 (`FILES`)** — `manhwa-studio-assets`. Enabled on the account 2026-10-19; the earlier `error 10042`
  was the account-level R2 entitlement, **not** token scope. Asset routes live in `worker/src/assets.ts`
  (org-scoped, 10 MiB cap, content-type allow-list) and are covered by `tests/asset.test.ts`.
- **Supabase Auth** — set `SUPABASE_URL` (public, bare project origin) as a var. The Worker verifies
  `Authorization: Bearer` access tokens against `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, accepting
  only ES256/RS256 (or HS256 with a configured `SUPABASE_JWT_SECRET`, secret-only, for legacy projects).
  `APP_ORIGIN` must be a canonical origin and is never derived from a request `Host`. **No migration is
  needed**: `users.id` is `TEXT` and accepts the Supabase UUID `sub`.
- **`ALLOWED_ORIGINS`** — comma-separated **exact** origins allowed to call the API cross-origin (e.g. the
  Vercel origin, production *and* each preview origin actually used). Wildcards are impossible by design.
- **Secrets** — `bunx wrangler secret put <NAME>`. Generation requires **both** `GEMINI_API_KEY` and an
  explicit `GEMINI_MODEL`; without them it answers `provider_not_configured` and charges nothing.

## First-use organizations

No seeding step is required. The first authenticated request from a verified user provisions exactly one
organization plus an `owner` membership, with every key derived from their Supabase `sub` (a UUID)
(`worker/src/provisioning.ts`). Repeats and concurrent first sign-ins are no-ops, an existing membership
always wins, and a non-canonical subject is refused without creating a tenant. Covered by
`tests/provisioning.test.ts`, `tests/supabase-tenancy.test.ts` (UUID subjects, concurrent convergence,
no email-based linking); still **not** exercised against a real D1 or a real session.

## Cross-site topology: no cookie to work around (TASK 11)

The session is a Supabase access token held by the browser and sent as `Authorization: Bearer`, so the
old `__Host-` cookie constraint is gone: a `*.vercel.app` frontend can call a `*.workers.dev` API with
plain CORS as long as (1) the frontend origin is in `ALLOWED_ORIGINS` and (2) `Authorization` is in the
preflight allow-list — both are already enforced in `worker/src/origins.ts`.

That retires the TASK 10 same-origin proxy recommendation for authentication. What replaces it is token
hygiene: the access token is readable by page script (inherent to a bearer design), so keep Supabase's
refresh/expiry settings sane, never ship a service-role key to the browser
(`src/lib/supabaseConfig.ts` rejects one), and let `APP_ORIGIN` stay this Worker's own origin for the
same-origin mutation guard.

## Environment separation

- Production vs preview: add wrangler environments (`[env.preview]`) when a staging need exists; do not
  share database bindings across environments.
- Non-secret config belongs in `[vars]`; credentials never do.

## Rollback procedure

1. Worker deployments are versioned: `bunx wrangler rollback` (or Workers → Versions) restores the
   previous deployment without a rebuild.
2. Alternatively redeploy a known-good commit: check out the SHA, `bun install --frozen-lockfile`,
   `bunx wrangler deploy`.
3. Frontend: Vercel → Deployments → previous deployment → *Promote to Production* (or `vercel rollback`);
   an env change is per-deployment, so revert the value and redeploy.
4. **Data safety:** D1 and R2 bindings exist, so a Worker rollback can change which schema and bucket a
   version expects. **No down-migrations have been written.** Capture a restore point with
   `bunx wrangler d1 time-travel info manhwa-studio` before applying a migration, and note that
   **rolling back the Worker does not roll back an applied migration**.

## Explicitly not claimed

- **No owner-owned production URL exists yet.** The only live (stale) backend is the Freebuff-hosted site.
- **No CI exists at all** — GitHub Actions was removed in ROADMAP TASK 01 by owner decision — so nothing
  performs deploys or gates them. Validation is the local gate
  (`bun install --frozen-lockfile` → `lint` → `test` → `build`) run by the agent, plus the verifier above.
- Live sign-in and live AI generation are **unverified**.
- Organization provisioning **now exists in code** (TASK 09, `worker/src/provisioning.ts`) and is tested
  against real SQLite, but it has never run against a real D1 or a real signed-in session — that begins
  with the first deploy. The TASK 08 report §3.4 describes the pre-TASK-09 state.

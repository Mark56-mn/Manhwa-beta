# Deployment & Rollback — Manhwa Studio API Worker

**Status (19 October 2026; reconciled 22 October 2026 under ROADMAP TASK 02): D1 and R2 provisioned per
the reports below; the Worker itself is NOT deployed.** The backend schema reportedly exists on the
owner's Cloudflare account; no Worker script, DNS, or zone change has been made. Everything in the
"CREATED / live" column comes from the task reports and local `wrangler dev` probes — **it has not been
independently verified from this repository** in ROADMAP TASK 01 or 02, neither of which deployed or
migrated anything.

## What exists today

| Piece | State |
|---|---|
| `wrangler.toml` + `worker/src/` (Hono API) | in repo, verified locally with `wrangler dev` (workerd): `/healthz` → 200, `/readyz` → 200 `ready` with real `d1: ok` |
| Cloudflare API token | audited 19 Oct 2026 (twice): valid; **account read ✓, Workers scripts ✓, D1 ✓, zones ✓ (1 zone), R2 ✗ (error 10042 — now resolved after owner activated R2 on the account)** |
| D1 database `manhwa-studio` | **REPORTED CREATED** (id `d9557398-b439-463a-b5aa-a3703d5c3fdb`, region WNAM) by TASK 07; `migrations/0001_init_tenancy.sql` applied locally and, per that report, remotely. Not re-verified by TASK 01/02. |
| R2 bucket `manhwa-studio-assets` | **REPORTED live** (created + verified 19 Oct 2026, WNAM, Standard) by TASK 12. Worker binding `FILES` wired in `wrangler.toml`. Health check (`/readyz`) reports `r2: ok` in workerd. Asset routes are **implemented** in `worker/src/assets.ts` (list/read/HEAD/upload/delete, org-scoped, 10 MiB cap, content-type allow-list) and covered by `tests/asset.test.ts` — they are unverified against the live bucket because no Worker is deployed. |
| Sign in with Freebuff (OIDC) | SDK installed and mounted, but **no client registered** — registration requires the owner's Freebuff login; routes answer `auth_not_configured` (503) |
| Worker deployment | **none** |

## Prerequisites

- Bun ≥ 1.4 (see `README.md`).
- `.env.local` populated via `bash scripts/store-secrets.sh` (gitignored, mode 600).
- Owner authorization — deployment is never performed automatically.

## Deploy procedure (planned; requires authorization)

```bash
# 1. Load the token into the environment WITHOUT printing it:
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)

# 2. Deploy the worker (reads wrangler.toml):
bunx wrangler deploy

# 3. Verify the deployed endpoints (replace with the URL wrangler prints):
curl -s https://manhwa-studio-api.<account-subdomain>.workers.dev/healthz   # expect {"status":"ok"}
curl -s https://manhwa-studio-api.<account-subdomain>.workers.dev/readyz    # expect honest per-dependency checks
```

Never pass the token as a command-line literal, in committed files, or in chat/logs. `wrangler` masks
secret-looking values in its own output (verified locally: values printed as `(hidden)`).

## Bindings (created only when their task lands)

- **D1 (TASK 07 — DONE):** database `manhwa-studio` created (WNAM), binding wired in `wrangler.toml`,
  `0001_init_tenancy.sql` applied locally and remotely; `/readyz` now hard-gates on a real `SELECT 1`.
  New migrations: add `migrations/000N_*.sql`, then run `bunx wrangler d1 migrations apply manhwa-studio --local`
  and (authorized) `--remote`.
- **R2 (TASK 12):** enabled on the account 19 Oct 2026 (owner activated R2 subscription); bucket `manhwa-studio-assets` created + verified locally and remotely (REST create/read/delete 200). Worker binding `FILES` wired in `wrangler.toml`; `/readyz` reports `r2: ok` in workerd. TASK 12 wires the actual asset upload/download routes. No S3 endpoint or account ID is required — the Worker binding + Cloudflare REST API use the account id already in `wrangler.toml`.
- **Sign in with Freebuff (TASK 07 auth):** the owner registers the client with their Freebuff login —
  `npx @freebuff/auth register --project manhwa-studio --name "Manhwa Studio" --environment development --redirect-uri http://localhost:8788/auth/freebuff/callback` —
  then set `FREEBUFF_CLIENT_ID` / `FREEBUFF_ISSUER` / `APP_ORIGIN` as wrangler `[vars]` (public config,
  no secrets exist for this SDK).
- **Secrets (later tasks):** `bunx wrangler secret put <NAME>` — values are typed interactively (not
  echoed) and stored server-side only.

## Environment separation

- Production vs preview: add wrangler environments (`[env.preview]`) when a staging need exists; do not
  share database bindings across environments.
- Non-secret config belongs in `[vars]`; credentials never do.

## Rollback procedure (planned)

1. Worker deployments are versioned: `bunx wrangler rollback` (or the Cloudflare dashboard
   Workers → Versions) restores the previous deployment without a rebuild.
2. Alternatively redeploy a known-good commit: check out the SHA, `bun install --frozen-lockfile`,
   `bunx wrangler deploy`.
3. Data safety: D1 and R2 bindings now exist (TASK 07/12), so a Worker rollback can change which schema
   and bucket a version expects. **No down-migrations have been written** — any destructive schema
   change must ship a documented down-path and a tested restore of the affected data first. Rolling back
   the Worker alone does not roll back an applied migration.

## Explicitly not claimed

- No production URL exists yet. **No CI exists at all** — GitHub Actions was removed in ROADMAP TASK 01
  by owner decision — so nothing performs deploys or gates them. Validation is the local gate
  (`bun install --frozen-lockfile` → `lint` → `test` → `build`) run by the agent, plus the
  deployment/runtime checks above once a deploy is authorized.
- The frontend (`dist/`) has no configured host yet.

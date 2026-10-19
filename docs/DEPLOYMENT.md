# Deployment & Rollback — Manhwa Studio API Worker

**Status (19 October 2026): procedure DOCUMENTED, NOT EXECUTED.** No deployment has been made; nothing
on Cloudflare has been created or changed by this repository. Everything below was derived from the
verified local setup and the audited token permissions.

## What exists today

| Piece | State |
|---|---|
| `wrangler.toml` + `worker/src/` (Hono API) | in repo, verified locally with `wrangler dev` (workerd): `/healthz` → 200 |
| Cloudflare API token | audited 19 Oct 2026: valid; **account read ✓, Workers scripts ✓, D1 ✓, zones ✓ (1 zone), R2 ✗ (error 10042)** |
| D1 database | **does not exist yet** (planned TASK 07) |
| R2 bucket | **blocked** until the owner adds R2 permission to the token (planned TASK 12) |
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

- **D1 (TASK 07):** `bunx wrangler d1 create manhwa-studio` → paste the returned `database_id` into the
  `[d1_databases]` block in `wrangler.toml` → apply migrations → redeploy → confirm `/readyz` reports
  `d1: ok` from a real `SELECT 1`.
- **R2 (TASK 12):** requires the token to gain "Workers R2 Storage: Edit" first (currently denied,
  API error 10042).
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
3. Data safety: while no D1/R2 bindings exist, rollbacks cannot affect data. Once TASK 07 lands, database
   migrations must ship a documented down-path before any destructive change.

## Explicitly not claimed

- No production URL exists yet; no CI performs deploys (CI currently runs lint/test/build only, and is
  itself unexecuted until pushed).
- The frontend (`dist/`) has no configured host yet.

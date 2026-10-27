# TASK 10 — Handoff

**Status:** review and preparation complete. **Nothing was deployed, no remote migration applied, no OIDC
client registered, no production setting changed.** The only account command issued was a read-only
`wrangler d1 migrations list --remote`.

- **Branch:** `task/TASK-10-DEPLOYMENT-REVIEW` (base `task/TASK-09-PRODUCTION-READINESS` @ `872f679`)
- **Previous `main`:** `d0eba90` — untouched; no merge, no force-push
- **Evidence:** [`docs/audits/TASK-10-DEPLOYMENT-REVIEW.md`](../audits/TASK-10-DEPLOYMENT-REVIEW.md)
- **Approval gate:** Phase D of that report needs the owner's explicit go-ahead

---

## 1. Resolved in this task

**The migration conflict is gone, and the untracked file was never touched.**

- `wrangler.toml` now sets `migrations_dir = "db/migrations"`.
- The three tracked migrations moved there with `git mv` (**recorded as renames**, filenames unchanged — so
  the remote `d1_migrations` ledger still matches).
- `migrations/0002_assets.sql` is **still in place**: 1014 bytes, mtime `Oct 19 13:20`, byte-identical.
- `bun run migrations:check` now exits **0** (it was exit 1) and simply *reports* the legacy file.
- `wrangler d1 migrations apply --local` applies the whole chain in one run: **3 migrations, 13 commands,
  exit 0**, ledger rows `1,2,3`, 15 application tables, and a second run says "No migrations to apply!".
- `wrangler d1 migrations list --remote` (read-only) shows pending = `0002_assets_and_replication.sql`,
  `0003_story_generation.sql`. **The stray duplicate is absent from the real database's pending chain** —
  which was the actual blocker.

**Don't undo it:** pointing `migrations_dir` back at `migrations/` reinstates the trap. If that file ever
needs to leave, move it (never delete someone else's untracked work).

## 2. Verified in this task

Provisioning (`worker/src/provisioning.ts`) reviewed line by line and exercised by
`tests/provisioning.test.ts` — **21 cases**, including eight concurrent first sign-ins producing exactly one
organization / one membership / one audit event, and a client-supplied `organization_id` being ignored.
Full gates: **349 tests / 24 files / 1185 assertions, 0 fail**; `tsc` 0; `lint` 0; `build` 0; dry-run
196.18 KiB (gzip 45.04 KiB).

## 3. The decision that most affects success — `APP_ORIGIN`

Read from the SDK source: `origin = base.origin`, `callbackUrl = ${origin}/auth/freebuff/callback`,
`secure = base.protocol === 'https:'`, cookies `__Host-freebuff_session` / `__Host-freebuff_txn-<state>`
with `Path=/; HttpOnly; SameSite=Lax[; Secure]`, and **no comparison of the request's Host to `baseUrl`**.

Therefore, for the recommended Vercel-proxy topology:

| Variable | Value |
|---|---|
| `APP_ORIGIN` | **`https://manhwa-beta.vercel.app`** — the *browser-facing* origin, not the Worker's |
| `ALLOWED_ORIGINS` | `https://manhwa-api.oppa-technologies.online` (the API's own origin, for the no-`Origin` mutation fallback) |
| `FREEBUFF_ISSUER` | `https://freebuff.com/oidc` |
| OIDC redirect URI | `https://manhwa-beta.vercel.app/auth/freebuff/callback` |
| `VITE_API_BASE_URL` | **unset** (same-origin build) |

Setting `APP_ORIGIN` to the Worker's hostname would put the `__Host-` cookie on the wrong host: the app
would load and every API call would answer **401**. This is the single most likely way to "break" a working
deployment.

## 4. Owner actions, in order

1. Choose the Worker hostname — proposed: custom domain `manhwa-api.oppa-technologies.online` (zone
   `27fc0052c37507c9ef98f9ff1d306a3f` is active on this account).
2. Register the OIDC redirect URI for the **frontend** origin (owner's Freebuff login; the existing client
   `942e460d-…` can take an extra redirect URI).
3. Approve Phase D: `wrangler deploy`, then `wrangler d1 migrations apply --remote` (capture the
   time-travel bookmark first — there are no down-migrations).
4. Add the same-origin `/api/*` and `/auth/*` rewrites to `vercel.json` **above** the SPA catch-all and
   redeploy Vercel (its project settings are not reachable from this workspace).
5. Optional: decide the stale Freebuff-hosted Worker's fate (leave published but documented as
   non-authoritative, or unpublish).

## 5. Not verified — do not claim otherwise

No live Worker; no live D1/R2 from a deployment; no real sign-in or session; no production provisioning
event; no live AI generation; no browser/visual check; provisioning proven against SQLite, not D1's engine;
`/readyz`'s `d1: ok` is a `SELECT 1`, not proof of schema.

## 6. Reproduce

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile
bunx tsc --noEmit && bun run lint && bun run test && bun run build
bun run migrations:check                                        # expect exit 0
CI=true bunx wrangler d1 migrations apply manhwa-studio --local --persist-to /tmp/rehearsal
bunx wrangler d1 migrations list manhwa-studio --remote         # read-only: two pending
```

`wrangler d1 migrations apply` has **no `--yes` flag** (`Unknown argument: yes`); non-interactive use needs
`CI=true` plus a TTY or piped confirmation.

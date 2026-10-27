# TASK 10 — Deployment review and preparation (awaiting owner approval)

**Branch:** `task/TASK-10-DEPLOYMENT-REVIEW` (from `task/TASK-09-PRODUCTION-READINESS` @ `872f679`)
**Date:** 27 October 2026
**Status:** **review and preparation only. Nothing was deployed, no *remote* migration was applied, no OIDC
client was registered, and no production setting was changed.** The single Cloudflare command run against
the account in this task was `wrangler d1 migrations list --remote`, which is read-only.

Read with [`docs/audits/TASK-09-PRODUCTION-READINESS-REPORT.md`](TASK-09-PRODUCTION-READINESS-REPORT.md),
[`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) and
[`docs/handoffs/TASK-10-DEPLOYMENT-REVIEW-HANDOFF.md`](../handoffs/TASK-10-DEPLOYMENT-REVIEW-HANDOFF.md).

---

## 0. What this task changes

| # | Question | Answer |
|---|---|---|
| 1 | Is the provisioning implementation correct? | Verified by reading the code and running its suite; see §1. Two limitations are stated honestly. |
| 2 | Is the migration conflict resolved without deleting the untracked file? | **Yes.** `wrangler.toml` now sets `migrations_dir = "db/migrations"`; the tracked chain moved there. `migrations/0002_assets.sql` is **still in place, byte-identical, never touched.** §2 has the evidence. |
| 3 | Does the chain work on a disposable D1-compatible database? | **Yes** — `wrangler d1 migrations apply --local` applied all three in one run: **13 commands, exit 0**, ledger rows `1,2,3`, 15 application tables, and a second run reports "No migrations to apply!". |
| 4 | What is the hostname and the same-origin auth design? | §3. **A correction matters here: `APP_ORIGIN` must be the frontend origin, not the Worker's.** |
| 5 | Are the blockers resolved? | The migration blocker **is** resolved. Two owner-only steps remain (hostname, OIDC registration) — §6. |

---

## 1. Provisioning implementation — verification

**What it does** (`worker/src/provisioning.ts`): on the first authenticated request from a verified user it
creates exactly one `organizations` row, one `users` row and one `organization_memberships` row with role
`owner`, then returns that organization id. An existing membership short-circuits before any write, so an
invited user never acquires a personal workspace.

**Why it cannot duplicate** — the guarantee is in the *keys*, not in a check-then-insert:

- `organizationIdForSubject(sub)`, `membershipIdForSubject(sub)` and `organizationSlugForSubject(sub)` are
  SHA-256 derivations of the verified `sub`.
- Two concurrent first sign-ins therefore compute identical primary keys and identical unique slugs, and
  each statement is `ON CONFLICT DO NOTHING` — the loser is a no-op.
- D1 exposes no interactive transaction, so this is the correct concurrency control here rather than a
  `BEGIN`/`COMMIT` pair. The re-read at the end (not the computed id) is what the caller uses.

**Security properties re-checked in review:**

| Property | Where enforced | Verified |
|---|---|---|
| Only after session verification | the call site sits *after* `deps.resolveUser` in every route | ✅ read of `projects.ts` / `story.ts` / `assets.ts` |
| No client input can choose a tenant | the function's only inputs are `env` and the verified `user`; nothing reads a header, query or body | ✅ 21-case suite includes a body-supplied `organization_id` that is ignored |
| Role is least-privilege | literal `'owner'` in the SQL; never a request value | ✅ asserted |
| Refuses non-canonical subjects | `isEligibleForProvisioning` (empty / whitespace-padded / >255) | ✅ asserted; a refused subject creates **no** row |
| No tenant leak | all routes still scope SQL by `organization_id`; another tenant's id → 404 | ✅ asserted through the real routes |
| Auditable | one `audit_events` row written **only** by the insert that changed a row (`meta.changes === 1`); best-effort | ✅ asserted, including "exactly one under eight concurrent sign-ins" |

**Limitations that must not be over-read:**

1. **SQLite, not D1's engine.** The suite runs the real migration files through `bun:sqlite` and the real
   Hono routes, but the remote D1 engine has never executed this code path. The first live sign-in is the
   real test.
2. **`ON CONFLICT DO NOTHING` hides uniqueness conflicts only** — not foreign-key failures. A malformed
   `sub` that violates a constraint would surface as a 500 rather than a duplicate; that is the intended
   trade-off (loud on referential errors, quiet on races).
3. **Eligibility is "any verified identity".** There is deliberately no allow-list or email-domain gate, so
   a signed-in user of *this* OIDC client always gets a workspace. If sign-ups must ever be restricted,
   that belongs here and is a product decision, not a bug.

**Suite result:** `tests/provisioning.test.ts` — **21 cases, all passing** (part of the 349-case run in §4).

---

## 2. The migration conflict — resolved structurally

### 2.1 Why the earlier plan was only a workaround

TASK 09's plan was "move the untracked file aside, then apply". That works, but it means every future
`apply` depends on a human remembering a manual step, and it asks the owner to give up a file they have kept
for weeks. This task removes the dependency instead.

### 2.2 What changed

| Change | Detail |
|---|---|
| Chain moved | `git mv migrations/000{1,2,3}*.sql db/migrations/` — **git recorded three renames**, so history is preserved; filenames are unchanged, which matters because `d1_migrations` records names |
| Config | `[[d1_databases]] migrations_dir = "db/migrations"` in `wrangler.toml` — one line, with a comment explaining why |
| Preflight | `scripts/check-migrations.mjs` now defaults to `db/migrations` (the same directory wrangler reads) and prints an informational note about `.sql` files left in the legacy directory |
| Code/test paths | 9 test files + the static guard in `tests/story-security.test.ts` updated to the new path |
| The untracked file | **untouched**: `migrations/0002_assets.sql`, 1014 bytes, mtime `Oct 19 13:20` — identical before and after |

### 2.3 Evidence

| Check | Result |
|---|---|
| `wrangler d1 migrations list --local` (fresh disposable state, `--persist-to /tmp/t10-local`) | exactly **3** files: `0001`, `0002_assets_and_replication`, `0003` — **the stray file is not listed** |
| `wrangler d1 migrations apply --local` (non-interactive) | **exit 0**, `🚣 13 commands executed successfully.`, all three ✅ |
| Ledger read-back | `[{id:1,0001_init_tenancy.sql},{id:2,0002_assets_and_replication.sql},{id:3,0003_story_generation.sql}]` |
| Schema read-back | **15 application tables** (`organizations`, `users`, `organization_memberships`, `projects`, `audit_events`, `assets`, `replication_outbox`, `replication_state`, `project_profiles`, `story_bibles`, `episodes`, `generation_jobs`, `credit_accounts`, `credit_holds`, `credit_ledger`) plus `d1_migrations` and D1's own `_cf_METADATA` |
| Second apply | `✅ No migrations to apply!` — idempotent |
| `bun run migrations:check` | **exit 0** — "OK — no blockers", plus the legacy-directory note |
| `wrangler d1 migrations list --remote` (READ-ONLY) | pending = **`0002_assets_and_replication.sql`, `0003_story_generation.sql`** — the stray duplicate is **absent from the real database's pending chain**, and `0001` is still recorded as applied |

The remote run is the one that matters: the deployed `apply` will now see exactly two pending, correct,
additive migrations. **Nothing was applied remotely.**

### 2.4 Gotchas worth recording

- `wrangler d1 migrations apply` has **no `--yes` flag** (`✘ [ERROR] Unknown argument: yes`). Non-interactive
  use needs `CI=true` with the confirmation piped, or a TTY.
- Migrations are matched by **filename**. Moving the directory is safe precisely because the names did not
  change; renaming a migration file would make an applied migration look pending.
- `0002_assets_and_replication.sql` remains idempotent against a database that already has `assets` — the
  production drift case — as TASK 09 proved and `tests/migration-safety.test.ts` still pins.

---

## 3. Hostname and same-origin authentication design (confirmed, with one correction)

### 3.1 Facts read from the SDK source (not recalled)

```
const base = checkedUrl(options.baseUrl, …);   if (base.pathname !== '/') throw …
const origin = base.origin;
const secure = base.protocol === 'https:';
const cookiePrefix = secure ? '__Host-' : '';
const sessionCookie = `${cookiePrefix}freebuff_session`;
const transactionCookie = (state) => `${cookiePrefix}freebuff_txn-${state.slice(0,16)}`;
const callbackUrl = `${origin}${AUTH_ROUTE_PREFIX}/callback`;      // → /auth/freebuff/callback
const setCookie = (name, value, maxAge) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
```

Two consequences:

1. **`redirect_uri` is derived from `APP_ORIGIN`**, never from the request. Whatever origin is configured is
   where the browser returns after OIDC, and therefore where the `__Host-` cookie is set.
2. The SDK's only request-header reads are `cookie`, `origin`, `sec-fetch-site` and `content-type`. It does
   **not** compare the request's `Host`/URL origin against `baseUrl`, so a reverse proxy is transparent to
   it. ✅ The Vercel-rewrite topology is viable.

### 3.2 The correction

`APP_ORIGIN` must be **the origin the browser uses — `https://manhwa-beta.vercel.app`** — *not* the Worker's
own hostname. If it were the Worker's hostname, the OIDC callback would set `__Host-freebuff_session` on the
Worker host while the page lives on the Vercel host: the cookie would never be sent, and every API call
would answer 401. With `APP_ORIGIN` = the frontend origin, the callback lands on the frontend origin, Vercel
forwards it to the Worker, the cookie is stored for the frontend host, and every later request carries it.

### 3.3 The resulting design

| Layer | Value |
|---|---|
| Browser sees | one origin: `https://manhwa-beta.vercel.app` |
| Frontend build | `VITE_API_BASE_URL` **empty** (same-origin) — `src/lib/apiConfig.ts` resolves that, no rebuild needed later |
| `vercel.json` | `/api/:path*` and `/auth/:path*` rewritten to the Worker origin, **above** the SPA catch-all |
| `APP_ORIGIN` (Worker var) | `https://manhwa-beta.vercel.app` |
| `ALLOWED_ORIGINS` (Worker var) | `https://<worker-origin>` — the API's own origin, plus any preview origin actually used |
| `FREEBUFF_ISSUER` | `https://freebuff.com/oidc` (the value the running Freebuff-hosted deployment uses, observed live) |
| `FREEBUFF_CLIENT_ID` | from registration; the existing client `942e460d-…` can simply take an extra redirect URI |
| OIDC redirect URI | `https://manhwa-beta.vercel.app/auth/freebuff/callback` |

**Why `ALLOWED_ORIGINS` must include the Worker's own origin.** `isAllowedMutationOrigin` accepts a missing
`Origin` only when `Sec-Fetch-Site: same-origin` **and** the request's own URL origin is allow-listed. A
proxied POST reaches the Worker at the *Worker's* URL, so without that entry the no-`Origin` fallback would
403 even though the user is legitimate. Browsers do send `Origin` on same-origin POSTs, so this is
defence-in-depth rather than the primary path — but it costs nothing and prevents a confusing failure.

### 3.4 Hostname

The Worker's own hostname is **invisible to the browser** under this design (Vercel proxies to it), so it no
longer has to be cookie-compatible. Two options:

| Option | How | Trade-off |
|---|---|---|
| **Custom domain (recommended)** | attach `manhwa-api.oppa-technologies.online` (zone `27fc0052c37507c9ef98f9ff1d306a3f` is **active** on this account, DNS already on Cloudflare) | stable and independent of the shared `workers.dev` namespace; one route entry; no dashboard trip |
| `workers.dev` subdomain | create the account subdomain (**API**: `PUT /accounts/<id>/workers/subdomain`, or once in the dashboard) | shared namespace; a later name change would alter `ALLOWED_ORIGINS` and DNS |

**Proposed:** `manhwa-api.oppa-technologies.online`, with `APP_ORIGIN` still the frontend origin (§3.2).

---

## 4. Verification results for this task

| Gate | Command | Result | Exit |
|---|---|---|---|
| Install | `bun install --frozen-lockfile` | 148 packages, lockfile untouched | **0** |
| Typecheck | `bunx tsc --noEmit` | clean | **0** |
| Lint | `bun run lint` | clean | **0** |
| Tests | `bun run test` | **349 pass / 0 fail**, 1185 assertions, 24 files | **0** |
| Build | `bun run build` | `✓ built in 815ms` | **0** |
| Migration preflight | `bun run migrations:check` | **OK — no blockers** (was exit 1 before this task) | **0** |
| Disposable apply | `wrangler d1 migrations apply --local` | 3 applied, 13 commands, re-apply a no-op | **0** |
| Worker bundle | `wrangler deploy --dry-run` | 196.18 KiB / gzip 45.04 KiB, both bindings resolved | **0** |
| Remote ledger | `wrangler d1 migrations list --remote` | 2 pending, stray absent | **0** |

---

## 5. Deployment checklist and exact commands — **NOT EXECUTED**

Nothing in this section has been run against production. Steps 1–4 need no new decisions; steps 5–7 need
the owner present; steps 8–10 change production state and are **explicitly awaiting approval**.

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

### Phase A — local, safe, no account changes (any time)

```bash
bun install --frozen-lockfile
bunx tsc --noEmit && bun run lint && bun run test && bun run build
bun run migrations:check                     # expect exit 0
bunx wrangler deploy --dry-run --outdir=/tmp/dryrun   # uploads nothing
```

### Phase B — read-only account checks

```bash
export CLOUDFLARE_API_TOKEN=$(grep -m1 '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)   # never printed
bunx wrangler whoami
bunx wrangler d1 list
bunx wrangler r2 bucket list
bunx wrangler d1 migrations list manhwa-studio --remote   # expect 0002_assets_and_replication, 0003
bunx wrangler d1 time-travel info manhwa-studio           # capture the bookmark BEFORE step 7
```

### Phase C — reversible configuration (owner present)

```bash
# C1. hostname — custom domain (recommended); add to wrangler.toml, or use the dashboard:
#     [[routes]]
#     pattern = "manhwa-api.oppa-technologies.online"
#     custom_domain = true
#
# C2. public [vars] in wrangler.toml
#     FREEBUFF_CLIENT_ID = "<from registration>"
#     FREEBUFF_ISSUER    = "https://freebuff.com/oidc"
#     APP_ORIGIN         = "https://manhwa-beta.vercel.app"        # the BROWSER's origin (§3.2)
#     ALLOWED_ORIGINS    = "https://manhwa-api.oppa-technologies.online"
#
# C3. OIDC client for the frontend origin
npx @freebuff/auth register --redirect-uri https://manhwa-beta.vercel.app/auth/freebuff/callback
```

### Phase D — production changes, **awaiting explicit approval**

```bash
# D1. FIRST DEPLOY — creates the Worker script
bunx wrangler deploy

# D2. FIRST REMOTE MIGRATION — additive only; no down-migration exists
bunx wrangler d1 migrations apply manhwa-studio --remote

# D3. optional AI generation (both required together; values typed interactively)
bunx wrangler secret put GEMINI_API_KEY
bunx wrangler secret put GEMINI_MODEL

# D4. verify the deployed Worker
curl -s https://manhwa-api.oppa-technologies.online/healthz        # {"status":"ok"}
curl -s https://manhwa-api.oppa-technologies.online/readyz         # d1/r2/auth/origins all ok
node scripts/verify-deployment.mjs --api https://manhwa-api.oppa-technologies.online \
     --origin https://manhwa-beta.vercel.app
```

### Phase E — frontend (`vercel.json`, then redeploy)

```jsonc
"rewrites": [
  { "source": "/api/:path*",  "destination": "https://manhwa-api.oppa-technologies.online/api/:path*" },
  { "source": "/auth/:path*", "destination": "https://manhwa-api.oppa-technologies.online/auth/:path*" },
  { "source": "/(.*)",        "destination": "/index.html" }
]
```

Keep `VITE_API_BASE_URL` **unset**; a change to it would require a rebuild and would be the wrong fix (§3.2).

### Acceptance criteria for the deploy

1. `/readyz` on the live origin reports `d1: ok`, `r2: ok`, `auth: ok`, `origins: ok`.
2. `verify-deployment.mjs` exits 0 (GET/OPTIONS only).
3. A fresh sign-in lands on the frontend origin, the browser stores `__Host-freebuff_session`, and
   `GET /api/v1/projects` returns **200 with an empty list** (not 403, not 401).
4. `SELECT COUNT(*) FROM organizations` increments by exactly **one** per fresh user and does not change on
   reload; one `organization.provisioned` audit row exists per created organization.
5. Cross-tenant reads still 404 and a foreign `Origin` still 403s.

---

## 6. Blockers and risks

| # | Item | Owner / status |
|---|---|---|
| 1 | Migration blocker | **resolved** in this task (structural, `migrations_dir`) |
| 2 | Choose the Worker hostname | **owner decision** — §3.4 proposes a custom domain |
| 3 | Register the OIDC redirect URI for the **frontend** origin | owner's Freebuff login |
| 4 | Approve Phase D (deploy + first remote migration) | owner |
| 5 | Vercel project settings are not reachable from here (no credentials) | owner applies Phase E |
| 6 | No down-migrations exist anywhere | mitigated by the time-travel bookmark in Phase B |
| 7 | Two databases exist historically (platform-owned vs owner's) | owner's `manhwa-studio` is authoritative |
| 8 | Stale Freebuff-hosted Worker is still published | decide: document as non-authoritative, or unpublish |

**Not verified, and not claimed:** no live Worker; no live D1/R2 access from a deployment; no real sign-in
or session; no production provisioning event; no live AI generation; no browser/visual/responsive check;
provisioning proven against SQLite only; `/readyz`'s `d1: ok` is a `SELECT 1`, not proof of schema.

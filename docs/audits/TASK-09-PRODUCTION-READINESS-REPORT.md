# TASK 09 — Production readiness (Cloudflare Worker + D1 + R2, first deploy)

**Branch:** `task/TASK-09-PRODUCTION-READINESS`
**Base:** `3420e2b` (`task/TASK-08-BACKEND-RECOVERY`, itself on `604ffa8` = `main` `d0eba90` + TASK-07 reconciliation)
**Date:** 27 October 2026
**Status:** **preparation only.** Nothing was deployed, no remote migration was applied, no OIDC client was
registered, no production variable or secret was set, and no application code was changed for the sake of
the investigation.

Read with [`TASK-08-BACKEND-RECOVERY-REPORT.md`](TASK-08-BACKEND-RECOVERY-REPORT.md) (the evidence for *why*
this topology), [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) (the executable procedure),
[`docs/handoffs/TASK-09-PRODUCTION-READINESS-HANDOFF.md`](../handoffs/TASK-09-PRODUCTION-READINESS-HANDOFF.md)
and the next task, [`tasks/TASK-10-DEPLOY-WORKER-AND-CONNECT-FRONTEND.md`](../../tasks/TASK-10-DEPLOY-WORKER-AND-CONNECT-FRONTEND.md).

---

## 0. Headline

1. **The functional blocker is gone.** A verified user is no longer answered
   `403 Not a member of any organization` forever: the first authenticated request provisions exactly one
   organization and an `owner` membership, derived from the verified OIDC `sub`. It is idempotent,
   race-safe without transactions, and tested (including eight concurrent first sign-ins).
2. **The migration trap is understood down to the byte and now guarded.** The tracked chain applies
   cleanly to a database that already has `assets`; the untracked duplicate fails with
   `table assets already exists at offset 268: SQLITE_ERROR` and would abort the whole apply. A preflight
   checker (`bun run migrations:check`) now refuses such a chain before `wrangler` ever touches D1.
3. **`wrangler.toml` still matches reality exactly**, and the Worker bundles for workerd at
   **196.18 KiB / 45.04 KiB gzip** with both bindings resolved. The account still has **zero Worker
   scripts** and **no `workers.dev` subdomain** — the script has never been deployed.
4. **`VITE_API_BASE_URL` alone cannot make sign-in work.** The SDK issues `__Host-…; Secure; HttpOnly;
   Path=/; SameSite=Lax` with **no `Domain=`** attribute, so the cookie is host-only. A
   `*.vercel.app` page calling a `*.workers.dev` API will never receive it. §4 gives the three topologies
   that can work and recommends one.
5. All local gates pass: **349 tests / 24 files / 1185 assertions**, `tsc` 0, `lint` 0, `build` 0. The one
   deliberate non-zero is the migration preflight (exit 1), which is the blocker detector working.

---

## 1. Priority 1 — organization provisioning

### 1.1 The defect

`worker/src/tenancy.ts` only ever **read** `organization_memberships`, and every `INSERT INTO
organizations` in the repository lived in a **test** file. The live database had `organizations 0`,
`users 0`. So a correctly authenticated user passed every gate and then hit
`403 {"error":"forbidden","detail":"Not a member of any organization."}` on every shared-workspace route
(projects, story, assets). Deploying would not have fixed it.

### 1.2 What was added — `worker/src/provisioning.ts`

| Concern | Mechanism |
|---|---|
| **Server-side only** | Runs strictly *after* `deps.resolveUser` has verified a session. No route provisions for an unauthenticated caller; no header, query parameter or body field participates in the decision. |
| **Idempotent** | Reads the existing membership first and returns it. An existing membership **always wins**, so an invited user (role `member`, someone else's org) never gets a personal workspace. |
| **Race-safe without transactions** | Every id is derived from the `sub` by SHA-256 (`org-…`, `mem-…`, `workspace-…` slug). Two concurrent first sign-ins therefore compute *identical* primary keys, and each write is `ON CONFLICT DO NOTHING`: the loser is a no-op, not a duplicate. D1 exposes no interactive transaction, so deterministically-keyed idempotent writes **are** the concurrency control. |
| **Least privilege** | The created role is `owner` — never `admin`, never a caller-supplied value. |
| **Non-canonical subjects refused** | `isEligibleForProvisioning` rejects null/empty/whitespace-padded/>255-char subjects. Two spellings of one subject would otherwise become two tenants. |
| **Auditable** | Exactly one `audit_events` row (`organization.provisioned`) per *created* organization, written only by the request whose insert actually changed a row (`meta.changes === 1`). Best-effort: an audit failure never denies a workspace. |
| **Tenant isolation unchanged** | Provisioning only *chooses* the tenant id; every existing route still scopes its SQL by `organization_id` and answers 404 for another tenant's id. |

Wiring: the read-only `firstOrganizationForUser(c.env, user.sub)` call was replaced by
`resolveOrganizationForUser(c.env, user)` at **all 7 protected-route call sites** —
`worker/src/projects.ts` (1), `worker/src/story.ts` (1), `worker/src/assets.ts` (5). `tenancy.ts` is
untouched and still owns the membership reads.

### 1.3 Deliberate behavior change

| Before | After |
|---|---|
| Verified user, no membership → **403** forever | First request → **200**, one workspace provisioned |
| No code could create a tenant | Server creates one, keyed by `sub` |
| — | Non-canonical subject → **403** and **no** tenant created |

One pre-existing test asserted the old contract (`tests/projects.test.ts` → "returns 403 when the user
belongs to no organization"). It was **rewritten, not deleted or weakened**: it now asserts that a
non-canonical subject is refused **and** that the organization count is unchanged (the seed creates two,
and a refused request must not add a third). The 200-for-a-new-user path is covered by the new suite.

### 1.4 Tests — `tests/provisioning.test.ts` (21 cases)

Real migration files in real SQLite, the real Hono routes, only the identity provider injected:
exactly one `owner` membership; idempotent repeats; one audit event; display name stored while identity
stays keyed on `sub`; blank name falls back to a non-empty name; existing membership wins; no D1 → null;
ineligible subject → null with zero rows; two subjects → two tenants; **eight racing first sign-ins → one
organization, one membership, one user, one audit event**; a competitor's pre-written organization row is
reused (`created: false`) instead of duplicated; route-level 200-with-empty-list for projects **and**
assets; signed out → 401 with **no** rows created; a client-supplied `organization_id` in the body is
ignored (the row lands in the caller's own tenant); cross-tenant project read → 404; a mutation with no
allow-listed `Origin` → 403 with **no** provisioning.

---

## 2. Priority 2 — migration safety

### 2.1 Why the two files conflict

| File | Tracked? | Effect on a database that already has `assets` |
|---|---|---|
| `0001_init_tenancy.sql` | yes | genesis; already applied remotely (1 row in `d1_migrations`) |
| `0002_assets.sql` | **no — untracked** | bare `CREATE TABLE assets` + two bare `CREATE INDEX` → **fails** |
| `0002_assets_and_replication.sql` | yes | `assets` (IF NOT EXISTS) + `replication_outbox` + `replication_state` |
| `0003_story_generation.sql` | yes | 7 tables + 5 indexes, all IF NOT EXISTS |

Two independent reasons it breaks:

1. **Ordering.** `wrangler` applies the chain in plain `Array.prototype.sort()` filename order, where `.`
   (0x2E) sorts before `_` (0x5F) — so `0002_assets.sql` runs **before** the tracked
   `0002_assets_and_replication.sql`, despite the misleading "duplicate" appearance.
2. **Non-idempotent DDL.** The live D1 already has an `assets` table (created outside the chain in
   TASK 12, carrying indexes `idx_assets_r2_key` / `idx_assets_org_proj`). The stray file has no
   `IF NOT EXISTS`, so it fails on that table — and `wrangler` aborts at the **first** failure, leaving
   the tracked `0002` **and** `0003` unapplied.

### 2.2 Verified on a disposable local D1 (not remote, not cheap-shot)

`wrangler d1 execute --local --persist-to /tmp/t09-d1`, files applied in order:

| Step | Command | Exit | Meaning |
|---|---|---|---|
| 1 | `--file=migrations/0001_init_tenancy.sql` | **0** | genesis applies |
| 2 | legacy `assets` DDL (TASK-12 shape) | **0** | production drift reproduced |
| 3 | `--file=migrations/0002_assets_and_replication.sql` | **0** | tracked `0002` **tolerates** the existing table |
| 4 | `--file=migrations/0003_story_generation.sql` | **0** | applies |
| 5 | `--file=migrations/0002_assets.sql` (the stray) | **1** | `✘ [ERROR] table assets already exists at offset 268: SQLITE_ERROR` |

Resulting schema on the disposable database: 16 tables (`assets`, `audit_events`, `credit_accounts`,
`credit_holds`, `credit_ledger`, `episodes`, `generation_jobs`, `organization_memberships`,
`organizations`, `project_profiles`, `projects`, `replication_outbox`, `replication_state`,
`story_bibles`, `users`, plus D1's own `_cf_METADATA`).

### 2.3 Non-destructive plan (reproducible)

1. `bun run migrations:check` → must exit **0**. Today it exits 1 on the stray file.
2. Quarantine, **do not delete**, the untracked duplicate: `mv migrations/0002_assets.sql
   /tmp/0002_assets.sql.stray`. Its schema intent is fully covered by the tracked `0002`, so nothing is
   lost; the file itself is preserved off-tree.
3. Capture the restore point: `bunx wrangler d1 time-travel info manhwa-studio` (a live bookmark and the
   exact `restore … --bookmark=` command were verified available on 27 Oct 2026).
4. Re-run `migrations:check` → expect exit 0.
5. Only then `bunx wrangler d1 migrations apply manhwa-studio --remote` (owner-authorized; §7).

**Data-loss risk: none.** Both tracked migrations are strictly additive — no `DROP`, `ALTER`, `DELETE` or
`UPDATE` outside comments — and every table involved is empty (`orgs 0`, `users 0`, `projects 0`).
The residual risk is the absence of **down-migrations** anywhere in the repo, which is why step 3 exists
and why rolling back the Worker would **not** roll back an applied migration.

### 2.4 New guard — `scripts/check-migrations.mjs` (`bun run migrations:check`)

Static, database-free, works under `node` and `bun`. Reports blockers and warnings:

- **BLOCKER** non-idempotent `CREATE` in any file after the genesis one (the genesis is exempt: it is the
  baseline that builds the schema on an empty database and is already applied).
- **BLOCKER** `DROP TABLE/INDEX/VIEW/TRIGGER`, `ALTER TABLE`, `DELETE FROM`, `TRUNCATE`/`REPLACE INTO` —
  scanned with SQL comments stripped, so `0003`'s prose mentioning `ALTER` is not a false positive.
- **BLOCKER** empty file.
- **WARNING** two files sharing a numeric prefix, printed with the order `wrangler` will actually use.

Current output: **1 blocker** (`0002_assets.sql`, 3 non-idempotent statements) + **1 warning**
(prefix `0002` shared) → exit **1**. That is the detector working.

`tests/migration-safety.test.ts` (11 cases) pins all of it: the tracked chain builds 15 tables from
nothing; it is self-sufficient for `assets`; it contains no destructive statement; every `CREATE` after
`0001` is idempotent; on a **drifted** database it applies cleanly, preserves pre-existing
`projects`/`assets` rows and legacy indexes, and can be **re-applied** as a no-op; and the checker blocks
a synthetic stray duplicate (in the correct `.`-before-`_` order) while accepting the real chain.

---

## 3. Priority 3 — deployment configuration

### 3.1 Verified again today (read-only, owner's account `78bd087d85c6604c2dc25195a80eac91`)

| Check | Result | Matches `wrangler.toml` |
|---|---|---|
| `wrangler whoami` | 1 account, Account API Token | ✅ `account_id` |
| `wrangler d1 list` / `d1 info manhwa-studio` | `d9557398-b439-463a-b5aa-a3703d5c3fdb`, WNAM, **7 tables**, 111 kB | ✅ `database_id`, `database_name` |
| `wrangler r2 bucket list` | `manhwa-studio-assets` | ✅ `bucket_name` |
| `GET …/workers/scripts` | `{"result":[],"success":true}` → **0 scripts** | — never deployed |
| `GET …/workers/scripts/manhwa-studio-api` | **404** + `10007 "This Worker does not exist on your account."` (a missing *permission* would be 403) | — |
| `GET …/workers/subdomain` | **10007** "You do not have a workers.dev subdomain" | — no default hostname |
| `GET /zones?name=oppa-technologies.online` | **active**, id `27fc0052c37507c9ef98f9ff1d306a3f` | not referenced; usable |
| `wrangler deploy --dry-run` | `env.DB (manhwa-studio) → D1`, `env.FILES (manhwa-studio-assets) → R2`, **196.18 KiB / gzip 45.04 KiB**, `--dry-run: exiting now` | ✅ |

`wrangler.toml` therefore needs **no binding change**. The only edit is documentation: the commented
`[vars]` block now names all four public variables (`FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN`,
`ALLOWED_ORIGINS`), the secret names that must go through `wrangler secret put`, the fact that first-use
organizations need no configuration, and the hostname situation. Comments only — no behavior change.

### 3.2 Getting a hostname (two options, both owner actions)

1. **`workers.dev` subdomain** — open **Workers & Pages** once in the dashboard for this account; the
   landing page creates `<account-subdomain>.workers.dev`. Then `manhwa-studio-api.<subdomain>.workers.dev`
   exists on the next deploy. Cost: none. Note the *account-level* subdomain is shared with any future
   Worker.
2. **Custom domain (recommended for cookies — see §4)** — attach
   `manhwa-api.oppa-technologies.online` (zone is active on this account). Add a `[[routes]]` entry with
   `custom_domain = true` or use **Settings → Domains & Routes** in the dashboard. A route on an
   already-active zone has no separately listed Workers fee.

Either way the origin is only final **after** the first deploy, and `APP_ORIGIN` / the OIDC redirect URI
must be chosen to match it.

---

## 4. Priority 4 — authentication topology (the part that bites)

### 4.1 The cookie, as implemented by the SDK (read from `@freebuff/auth` source, not recalled)

```
Set-Cookie: __Host-<name>=…; Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age=…
```

- `__Host-` prefix ⇒ the browser **requires** `Secure`, `Path=/` and **no `Domain`** attribute.
- The shipped code emits **no `Domain=`** (`grep -c "Domain=" dist/*.js` → 0 in every file).
- Therefore the cookie is **host-only**: sent only to the exact host that set it.

Consequences, stated plainly:

| Frontend → API | Cookie sent? | Sign-in works? |
|---|---|---|
| Same origin (SPA served by the Worker, or API proxied under the frontend origin) | ✅ | ✅ |
| One parent domain, e.g. `manhwa.oppa-technologies.online` → `manhwa-api.oppa-technologies.online` | ✅ (same registrable domain, `SameSite=Lax` satisfied) | ✅ — but **not** with a host-only cookie unless the API is on the *same host*; see 4.2 |
| `manhwa-beta.vercel.app` → `manhwa-studio-api.<sub>.workers.dev` | ❌ host-only, and cross-site for `SameSite=Lax` | ❌ |

### 4.2 Recommended topology: **proxy the API under the frontend origin**

Keep the existing Vercel site and make `/api/*` and `/auth/*` same-origin forwards to the Worker. The
browser then believes everything is one origin: `__Host-` cookies are set and sent on that exact host,
`SameSite=Lax` is satisfied, and CORS is not involved at all.

```jsonc
// vercel.json — NOT APPLIED. Exact snippet for after the Worker origin exists.
// Add ABOVE the existing SPA catch-all, in this order:
"rewrites": [
  { "source": "/api/:path*",  "destination": "https://<worker-origin>/api/:path*" },
  { "source": "/auth/:path*", "destination": "https://<worker-origin>/auth/:path*" },
  { "source": "/(.*)",        "destination": "/index.html" }
]
```

With this shape, `VITE_API_BASE_URL` stays **empty** (`src/lib/apiConfig.ts` resolves that to
`same-origin`) and `ALLOWED_ORIGINS` needs no entry for the frontend, because no browser request is
cross-origin. Two caveats to verify on the first deploy: the OIDC redirect URI must be the **forwarded**
origin (`https://manhwa-beta.vercel.app/auth/freebuff/callback`), and `APP_ORIGIN` must be the origin the
Worker is *reached at* by the browser, so the two must agree.

**Why not simply set `VITE_API_BASE_URL`?** It changes where `fetch` goes; it cannot change where a
host-only cookie is valid, nor `SameSite`, nor the OIDC redirect URI. On a cross-site pairing the browser
will drop the cookie and every call answers 401 — the app would look broken while behaving honestly. That
is the exact trap this section exists to prevent.

**Alternatives, ranked:** (2) serve the SPA from the Worker itself via an `env.ASSETS` fallback — one
origin, no Vercel, needs a small code addition; (3) put both on one parent domain with a **proxied**
subdomain in front of the Worker so the API is reachable on the frontend's own host. All three are
cookie-correct; (1) needs no application code change.

---

## 5. Priority 5 — verification actually run

All commands were run in this workspace on 27 October 2026; exit codes are the commands' own.

| Gate | Command | Result | Exit |
|---|---|---|---|
| Install | `bun install --frozen-lockfile` | 148 packages, lockfile unchanged | **0** |
| Typecheck | `bunx tsc --noEmit` | clean | **0** |
| Lint | `bun run lint` (`tsc --noEmit`) | clean | **0** |
| Tests | `bun run test` (`bun test --isolate`) | **349 pass / 0 fail**, 1185 assertions, 24 files, 4.17 s | **0** |
| Build | `bun run build` | `dist/assets/index-Dn0IK5ue.js` 715.09 kB (gzip 204.04), CSS 41.20 kB | **0** |
| Migration preflight | `bun run migrations:check` | 1 blocker (stray file) + 1 warning → **intended** | **1** |
| Worker bundle | `bunx wrangler deploy --dry-run` | 196.18 KiB / gzip 45.04 KiB, both bindings resolved | **0** |
| Local Worker integration | `wrangler dev --local --persist-to /tmp/t09-dev` | see below | — |

Baseline for comparison: the same commit's tree **before** these changes was **317 tests / 22 files /
1068 assertions, 0 fail** — so this task adds **32 tests / 2 files / 117 assertions** and removes none.
(That comparison also proved the 26 UI failures I first saw were an artifact of running plain `bun test`
instead of the project's `bun run test --isolate`, not a regression.)

### 5.1 Local Worker integration (`wrangler dev`, workerd, config as committed)

| Request | Observed |
|---|---|
| `GET /healthz` | **200** `{"status":"ok"}`, `Vary: Origin` |
| `GET /readyz` | **200** `{"status":"ready"}` with `d1: ok ("D1 binding answered SELECT 1.")`, `r2: ok ("R2 binding attached.")`, `auth: not_configured`, `origins: not_configured` |
| `OPTIONS /api/v1/projects` with `Origin: https://manhwa-beta.vercel.app` | **403** `{"error":"forbidden","detail":"Origin not allowed."}` — correct while `ALLOWED_ORIGINS` is unset |
| `GET /api/v1/me` | **503** `auth_not_configured`, `Cache-Control: private, no-store` |
| `GET /auth/freebuff/signin` | **503** `auth_not_configured` (never a fake login) |

Honest degradation confirmed: with no OIDC client and no allow-list, the Worker reports that state instead
of pretending to be ready. The dev server was stopped and port 8787 verified closed afterwards.

### 5.2 Bundle secret scan (`dist/`)

| Pattern | Matches |
|---|---|
| Google API key (`AIza…`), `sk-…`, `service_role`, `SUPABASE_SERVICE_ROLE`, `CLOUDFLARE_API_TOKEN`, `GEMINI_API_KEY`, `BEGIN PRIVATE KEY`, `__Host-` | **0** each |
| Inlined `*.workers.dev` / `*.freebuff.page` / `*.vercel.app` / `oppa-technologies.online` origins | **none** |

The bundle is built **same-origin** (`VITE_API_BASE_URL` unset), which is also why it contains no API
origin — the same finding TASK 08 recorded for the live Vercel build.

---

## 6. Blockers and what is still unverified

**Owner-only actions (cannot be done from here):**
1. Create the `workers.dev` subdomain **or** choose the custom domain (§3.2).
2. Register the Freebuff OIDC client for the final origin (`npx @freebuff/auth register … --redirect-uri
   https://<origin>/auth/freebuff/callback`) — needs the owner's Freebuff login.
3. Authorize the first deploy and the remote migration apply.
4. Set `VITE_API_BASE_URL` / proxy rewrites on the Vercel project, whose settings are **not visible** from
   this workspace (no Vercel credentials).

**Genuinely unverified (must not be claimed):**
- No live D1/R2 access **from a deployed Worker** — no Worker is deployed.
- No real sign-in, no real session, no real provisioning event in production.
- No live AI generation; no provider secret is set anywhere.
- No browser/visual check of any layout; no cross-device or responsive verification.
- Organization provisioning is proven against real SQLite, **not** against D1's remote engine.
- `/readyz`'s `d1: ok` is a `SELECT 1` — it does **not** prove the tenancy schema exists.

---

## 7. Production commands — **NOT EXECUTED**

Nothing below was run. They are ordered; steps 1–3 are reversible, steps 4–6 are production-impacting and
need the owner's explicit authorization.

```bash
# 0. operator credential, never printed
export CLOUDFLARE_API_TOKEN=$(grep -m1 '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)

# 1. read-only: must be exit 0 before anything else
bun run migrations:check
bunx wrangler whoami
bunx wrangler d1 time-travel info manhwa-studio          # capture the restore bookmark

# 2. reversible: quarantine the untracked duplicate (preserved, not deleted)
mv migrations/0002_assets.sql /tmp/0002_assets.sql.stray
bun run migrations:check                                 # expect exit 0

# 3. reversible: hostname
#    dashboard: Workers & Pages → create the workers.dev subdomain
#    OR attach manhwa-api.oppa-technologies.online as a custom domain

# 4. FIRST DEPLOY — owner authorization required (creates the script)
bunx wrangler deploy

# 5. FIRST REMOTE MIGRATION — owner authorization required
bunx wrangler d1 migrations apply manhwa-studio --remote

# 6. public config, then secrets (values typed interactively; never in a flag, file or chat)
#    [vars] in wrangler.toml: FREEBUFF_CLIENT_ID, FREEBUFF_ISSUER, APP_ORIGIN, ALLOWED_ORIGINS
npx @freebuff/auth register --redirect-uri https://<origin>/auth/freebuff/callback
bunx wrangler secret put GEMINI_API_KEY                  # optional
bunx wrangler secret put GEMINI_MODEL                    # optional; both required together

# 7. verify the deployed Worker (GET/OPTIONS only)
curl -s https://<origin>/healthz
curl -s https://<origin>/readyz                          # expect auth: ok after step 6
node scripts/verify-deployment.mjs --api https://<origin> --origin https://<frontend origin>

# 8. frontend: same-origin proxy rewrites (§4.2) then a Vercel redeploy
# 9. optional: unpublish the stale Freebuff site so only one backend is live
```

**Recommended order:** steps 2 → 3 → 4 → 5 → 6 → 7, then the frontend in step 8. Deploying before the
hostname is chosen forces a second deploy to fix `APP_ORIGIN` and the redirect URI.

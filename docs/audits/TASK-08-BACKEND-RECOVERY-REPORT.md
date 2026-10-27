# TASK 08 — Backend recovery and deployment preparation

**Branch:** `task/TASK-08-BACKEND-RECOVERY`
**Base:** `604ffa8` (`task/TASK-07-RECONCILE-INTEGRATION` = `main` `d0eba90` + the TASK-07 reconciliation)
**Date:** 27 October 2026
**Status:** diagnosis and plan complete. **Nothing live was deployed, migrated, registered or published.**

Read this with [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) (executable procedure),
[`docs/DEPLOYMENT-VERCEL.md`](../DEPLOYMENT-VERCEL.md) (frontend settings) and
[`docs/handoffs/TASK-08-BACKEND-RECOVERY-HANDOFF.md`](../handoffs/TASK-08-BACKEND-RECOVERY-HANDOFF.md).

---

## 0. Headline

1. **The backend is not down any more.** The documented Freebuff host returns **200** on `/`, `/healthz`
   and `/readyz`, and **401** on `/api/v1/me`. The `503 Site temporarily unavailable` of 24 Oct is gone;
   the hosting quota reads `active` with 159 of 100,000 monthly requests used. **Nothing needs
   "restoring".**
2. **But that live Worker is stale, and it is not the backend the app needs.** It predates *all* the
   shared-workspace code: `/api/v1/projects`, `/api/v1/credits` and `/api/v1/jobs` answer **404**, and it
   emits **no CORS headers at all**. The repository's own verifier scores it **5/7** (exit 1).
3. **The owner's own Cloudflare account is fully provisioned and empty of code.** D1 `manhwa-studio`
   exists **with migration `0001` already applied**, R2 `manhwa-studio-assets` exists, `wrangler.toml`
   matches both — and there are **zero Worker scripts**. The Worker bundles cleanly for workerd
   (192.20 KiB, gzip 44.12 KiB).
4. **One untracked file currently makes the migration step impossible.** `migrations/0002_assets.sql`
   sorts *before* the tracked `0002_assets_and_replication.sql`, and it fails with
   `table assets already exists` — which **aborts the whole remote apply**, leaving `0002`/`0003`
   unapplied. Reproduced locally with the identical error.
5. **A Vercel frontend already exists and is live** — <https://manhwa-beta.vercel.app> — but it was
   built with **no API origin**, so it is disconnected by construction and says so. Its exact project
   settings, branch and commit are **not verifiable from here** (no Vercel credentials).
6. **Recommended route: Option B** — deploy this repository's Worker to the owner's own Cloudflare
   account (already-provisioned D1 + R2), then point the existing Vercel build at it. **Zero new
   infrastructure, zero cost, no code changes.** §5 is the exact ordered checklist.

---

## 1. Phase 1 — verified current state

Every row below was measured today (27 Oct 2026) from this workspace, not carried over from an older
report. "Live" = over the public internet; "account" = the owner's Cloudflare account
`78bd087d85c6604c2dc25195a80eac91`, read with the token in the gitignored `.env.local`.

### 1.1 The documented Freebuff backend is up

| Path | Status | Body / notes |
|---|---|---|
| `/` | **200** | `{"service":"manhwa-studio-api","status":"ok","phase":"TASK-07 D1 + tenancy foundation","routes":["/healthz","/readyz","/api/v1/me","/api/v1/assets/*","/auth/freebuff/*"]}` |
| `/healthz` | **200** | `{"status":"ok"}` |
| `/readyz` | **200** | `{"status":"ready","checks":{"d1":ok,"r2":ok,"auth":ok}}` |
| `/api/v1/me` | **401** | `{"error":"unauthorized"}`, `cache-control: private, no-store` |
| `/api/v1/assets/x` | **401** | route exists, auth enforced |
| `/api/v1/projects` | **404** | `text/plain` — Hono's default 404, *no such route* |
| `/api/v1/credits` | **404** | same |
| `/api/v1/jobs` | **404** | same |
| `/index.html`, `/favicon.ico`, `/vite.svg`, `/assets/index.js` | **404** | **no frontend assets are deployed to this host** |
| `/auth/freebuff/signin` | **303** | redirect to `https://freebuff.com/oidc/authorize?…client_id=942e460d-c8fb-45f4-9005-8b497eb1c6a7&redirect_uri=https%3A%2F%2Fsite-ad1c92…freebuff.page%2Fauth%2Ffreebuff%2Fcallback…` |
| `OPTIONS /api/v1/me` | **404** | **no CORS preflight handling exists in the deployed build** |
| `GET /healthz` with `Origin:` | 200 | **no `Access-Control-Allow-Origin`, no `Vary`** |

**So: the deployment answers liveness and readiness honestly and enforces authentication, but it cannot
serve the current application.** The frontend needs `/api/v1/projects` (404) and, if it is hosted
anywhere else, credentialed CORS (absent).

### 1.2 Hosting is not suspended

From `sites_inspect` (production) and `sites_list`:

- Site `Manhwa-beta`, `siteId e2c278d1-f97b-4990-9b14-3df3d60b3997`.
- Production environment `ad1c9222-29fc-492d-966c-a1d060a96319`: **`published: true`**,
  `unpublished_at: null`, `deployed_at 2026-10-22T11:25:44Z`. The activity log holds exactly **one**
  `deploy` receipt (`state: succeeded`) and the D1/R2 provisioning receipts.
- Preview environment `4595f88f-8931-4206-b907-656628b5785a`: `published: false`, `deployed_at: null` —
  **never deployed**.
- Quota: **`state: "active"`**, `message: null`. Used: requests **159/100,000**, CPU **529.857/5,000,000 ms**,
  D1 **180,224/100,000,000 B**, rows read **595/50,000,000**, rows written **54/100,000**, R2 **0/1,000,000,000 B**.
- `variableQuota: {used: 0, limit: 25}` → **no user-set variables on the site**; the auth variables are
  platform-injected reserved names.

The 24 Oct "Site temporarily unavailable / hosting usage is being checked" state is **resolved**. The
earlier report was accurate when written and is no longer current.

### 1.3 The live deployment's bindings are *platform* resources, not the owner's

`bindings` on production: `DB` → D1 `site-1d7d701600f44a05bc02ddd6ce56d288`, `FILES` → R2
`site-8179e1b534df41b4a059b13ebb2aaba6`, both created 2026-10-22 on the Freebuff platform account
`6e5a40dd9362fb315de7ecbaad2ca12b` (namespace `freebuff-sites-prod`). They are **not** the owner's D1/R2.

> **Consequence:** two D1 databases exist for one product — the platform-bound one (180 KB) and the
> owner's `manhwa-studio` (111 KB, migration `0001` applied). The repository's own probe already flagged
> this (`docs/audits/FREEBUFF_DATABASE_ACCESS_PROBE.md` §10). Whichever store is authoritative must be a
> deliberate owner decision; the recommendation in §3 picks the owner's, because it is the one the
> repository can migrate, back up and inspect.

### 1.4 Can an existing Worker deployment be recovered?

**There is no owner-owned Worker deployment to recover** — the account's script list is empty:

```
GET /accounts/78bd087d…/workers/scripts → { "result": [], "success": true }
```

Also **the account has no `workers.dev` subdomain** (`GET …/workers/subdomain` → error **10007**, "you do
not have a workers.dev subdomain"). So the owner's Worker has never been deployed and has no default
hostname yet. Two ways to give it one: open Workers & Pages once in the dashboard (creates the
subdomain), or attach a custom domain — and there is a usable zone (§1.5).

### 1.5 The owner's Cloudflare resources still exist and match the config

| Resource | Verified live | `wrangler.toml` | Match |
|---|---|---|---|
| D1 database | `manhwa-studio`, `d9557398-b439-463a-b5aa-a3703d5c3fdb`, WNAM, created 2026-10-19, `num_tables 7`, 111 kB | `database_name = "manhwa-studio"`, `database_id = "d9557398-…"` | **yes** |
| R2 bucket | `manhwa-studio-assets`, created 2026-10-19; 0 bytes used | `bucket_name = "manhwa-studio-assets"` | **yes** |
| Account | `78bd087d85c6604c2dc25195a80eac91` | `account_id` | **yes** |
| Zone | `oppa-technologies.online`, **active**, id `27fc0052c37507c9ef98f9ff1d306a3f` | not referenced | unused today |
| Worker script | **none** | `name = "manhwa-studio-api"` | n/a — not deployed |

The `wrangler.toml` config therefore **matches reality**; it is simply not deployed. Custom-domain
capability is proven in-use on this account: `api.oppa-technologies.online` already CNAMEs to
`oppa-backend.onrender.com` (a *different* project), while `app.` and `manhwa.` have no record.

### 1.6 The live remote D1 schema (read-only query)

`bunx wrangler d1 execute manhwa-studio --remote --json`:

- `d1_migrations` holds **exactly one row: `0001_init_tenancy.sql`**.
- Tables present: `assets`, `audit_events`, `organization_memberships`, `organizations`, `projects`,
  `users`, `d1_migrations`, `sqlite_sequence`, `_cf_KV` (`_cf_KV` is Cloudflare's own D1
  read-replication table, not ours).
- Indexes present include `idx_assets_r2_key` and `idx_assets_org_proj` — i.e. **`assets` already exists
  in production**, created outside the migration chain.
- Rows: `organizations 0`, `users 0`, `projects 0`. **There is no production data to lose.**

### 1.7 The Vercel frontend: it exists, and it is disconnected

<https://manhwa-beta.vercel.app> is live (`server: Vercel`, `x-vercel-id`, `x-vercel-cache: HIT`,
`age: 166442` s), serves the app (`text/html` with `id="root"`) and its SPA fallback.

What the deployed bundle actually says, fetched from `/assets/index-CS-H0KVd.js`:

- Present: `DEMO ONLY`, `No rendered video exists`, `YouTube: Not connected`, `Sign in with Freebuff`,
  `Server-backed`, `browser-local projects below` — i.e. the **post-23-Oct honest UI**.
- Guidance strings present: `This page was built without` and `not an absolute http(s) origin`.
- **Every absolute host in the bundle is a third party** (`images.unsplash.com`, `react.dev`,
  `redux.js.org`, `bit.ly`). **No API origin of any kind is inlined.**

So `VITE_API_BASE_URL` was **unset/empty at build time**. The deployment is therefore a same-origin
build: its API calls go to `manhwa-beta.vercel.app/api/…`, which the SPA rewrite answers with
`index.html`, and the app shows its explicit "built without `VITE_API_BASE_URL`" diagnostic instead of
fake success. **This is the correct honest behaviour — and it is also why the cloud workspace does not
work on that deployment.**

The page title is `Manhwa Studio — AI Webtoon Production & Script Studio`, which is the title **before**
`3423a20` (26 Oct) renamed it to `Manhwa Studio — Webtoon Script & Story Studio`. The live Vercel build
is therefore from the `fe80671`…`d0eba90` window (23–26 Oct), **not** from the reconciled TASK-07 branch.

**Not verifiable from this workspace:** the Vercel project's identity, its configured branch/commit, its
environment variables and its Deployment Protection settings. There are no Vercel credentials here
(`VERCEL_TOKEN` unset, no CLI login), so the project could not be inspected, created or configured.

### 1.8 Which commit is the live Worker running?

Identified by string forensics against git history, not by guesswork:

| Live behaviour | Introduced by | Commit date |
|---|---|---|
| `Vary: Origin` + the `app.use('*')` CORS middleware | `fe80671` | 2026-10-23 |
| `app.route('/', projectsApp)` and `/api/v1/projects` in the banner | `fe80671` | 2026-10-23 |
| `/api/v1/me` + `/api/v1/assets/*` in the banner, `phase: "TASK-07 D1 + tenancy foundation"` | `8d74d67` (TASK 12) | 2026-10-20 |

The live Worker has the TASK-12/07-era banner and **none** of `fe80671`'s additions. Its own banner
agrees. Combined with the single deploy receipt at **2026-10-22T11:25:44Z**, the deployed build is a
**pre-`fe80671` revision (≈ 20–22 Oct)** — roughly 40 commits behind `main`.

---

## 2. Phase 2 — recovery options compared

Costs for options A and B are free-tier numbers: the Freebuff allowances were **measured live** (§1.2);
the Cloudflare numbers are from current official documentation
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)): Workers Free **100,000
requests/day, 10 ms CPU per invocation, no credit card**; D1 Free **5 GB, 5M rows read/day, 100,000 rows
written/day**; R2 Free **10 GB-month Standard, 1M Class A, 10M Class B, egress free**. Above the free
allowances: Workers Paid **$5/month** (10M requests + 30M CPU ms), then D1/R2 usage rates; a custom
domain on an **already-active zone** has **no separately listed Workers fee**.

| | **A — Freebuff-hosted backend (existing site)** | **B — owner's own Cloudflare Worker** | **C — another host** |
|---|---|---|---|
| **What exists today** | published, `active` quota, D1+R2 bound, **auth already registered** for its origin | D1 (0001 applied) + R2 provisioned, **0 scripts**, no `workers.dev` subdomain | nothing; the owner separately runs `oppa-backend.onrender.com` for another product |
| **Owner actions** | redeploy current code to the site; find a way to apply SQL to the platform D1; add an `env.ASSETS` fallback to serve the SPA | create the subdomain **or** attach a custom domain; add `ALLOWED_ORIGINS`; register the OIDC client for the new origin; authorize deploy + migration; (optional) set 2 AI secrets | provision a new host **and** a new database; rewrite the data layer; re-register identity; duplicate storage |
| **Free tier / cost** | measured: 100k req/mo, 10k/day, 5M CPU ms/mo, D1 100 MB + 50M rows read + 100k writes/mo, R2 1 GB. **$0** today (159 requests used) | 100k req/day, D1 5 GB + 5M reads/day + 100k writes/day, R2 10 GB. **$0** today (0 requests, 0 bytes, ≥ 100 B free tier is ~10⁶× headroom) | new free tier, then new paid plans; **duplicates** D1/R2 |
| **Credentials** | none new (auth client `942e460d-…` already covers that origin) | existing `CLOUDFLARE_API_TOKEN` (**already works** — verified) + `npx @freebuff/auth register` with the owner's Freebuff login | new provider account + new secrets |
| **DB compatibility** | platform D1, schema unknown, **no SQL-write tool exists** — migrations would need dedicated server-side code | **exact match**: real D1 with `0001` applied, `wrangler.toml` correct, `d1 migrations apply --remote` is the supported path | D1 has no Postgres wire protocol; D1's REST API needs an account-scoped token; the repo's own probe found no supported external DB interface (ownership would move off Cloudflare anyway) |
| **Storage compatibility** | platform R2 (`site-8179e1b5…`) | **exact match**: `manhwa-studio-assets` bound as `FILES` | re-implement `worker/src/assets.ts` against another object store |
| **Auth compatibility** | ✅ best — client already registered for that origin; same-origin sign-in works | needs a registration for the new origin (append a redirect URI to the same client keeps **one** identity provider) | new OIDC registration; the `@freebuff/auth` cookie flow assumes this stack |
| **Deployment complexity** | medium–high: prebuilt bundle + assets + a migration path for a database the owner cannot SQL into | **low: `wrangler deploy` + `wrangler d1 migrations apply --remote`**, both proven reachable with the existing token; bundle already builds (192.20 KiB / 44.12 KiB gzip) | high: rewrite + new infra + new identity |
| **Data-loss risk** | none for the owner's D1 (untouched); platform D1 has 180 KB of unknown-shape data that stays platform-owned | **none**: both tracked migrations are additive `IF NOT EXISTS` DDL, every table is empty (`orgs 0`, `users 0`, `projects 0`), and `assets` already exists so it is skipped | risk of a *third* divergent store |
| **Other blockers** | **`ALLOWED_ORIGINS` cannot be set with available tooling** (`variableQuota 0/25`; the only setter is for *secrets*) → a separately hosted frontend cannot call it cross-origin, and it cannot be unpaused/unstuck by us | one small **code** gap remains: no organization provisioning (§4.7) | violates the standing "one backend, one database, one identity" rule |
| **Effort** | largest of the three; needs code changes + a platform-side migration mechanism | **~30–60 min of owner actions; no code changes** | days |

### Recommendation: **Option B**

Deploy this repository's Worker to the owner's own Cloudflare account and keep the **owner's D1 as the
single authoritative database**. Reasons, all evidence-backed:

1. **It creates no duplicate infrastructure.** The D1 and R2 it uses already exist and already match
   `wrangler.toml`; D1 `0001` is applied and every table is empty, so there is nothing to lose.
2. **It is the only option where every setting is actually settable by the owner** — `ALLOWED_ORIGINS`,
   public vars, secrets, routes and migrations all go through `wrangler`, and the token already proves
   access (`wrangler whoami`, D1 list/query, R2 list, zones list, script list all succeeded; the Worker
   bundles). Option A's allow-list cannot be configured at all with the tools that exist.
3. **It needs no code change**, and the deployment artifact is already verified to build.
4. **It is free** (100k requests/day vs 159 requests *per month* today) and its recovery path is
   ordinary: `wrangler rollback` plus D1 time-travel.
5. It keeps one identity provider: the *existing* Freebuff client can take an additional redirect URI.

**When A would be the better answer:** if the owner wants a **single same-origin app with zero new
infrastructure and no Vercel dependency**, publishing the SPA and API together on the existing Freebuff
site is attractive — same origin means no CORS and no cross-site cookie problem at all. It is not
recommended *as the first step* only because it requires (a) a real code change to serve static assets
(`env.ASSETS.fetch`), and (b) a way to apply SQL to a platform database that exposes no SQL-write tool.

**C is rejected**: the code is Workers-shaped (`env.DB`/`env.FILES` bindings, Hono web-standard handler,
`@freebuff/auth` cookie flow); porting it means rewriting the data layer and identity and standing up a
third divergent store.

**Authority decision required either way.** Once B is live, the app must point at exactly one API. The
stale Freebuff site may be left published (harmless, and a fallback) but must be explicitly treated as
**non-authoritative**; the alternative is to unpublish it with `sites_set_published(published: false)`.

---

## 3. Phase 3 — deployment requirements audit

### 3.1 Migrations: content and safety

| File | Tracked | Contents | Safe? |
|---|---|---|---|
| `0001_init_tenancy.sql` | yes | `organizations`, `users`, `organization_memberships`, `projects`, `audit_events` + 4 indexes | **already applied remotely** |
| `0002_assets.sql` | **NO — stray, untracked** | `CREATE TABLE assets` (no `IF NOT EXISTS`) + `idx_assets_r2_key` + `idx_assets_org_proj` | **blocks the migration chain — see 3.2** |
| `0002_assets_and_replication.sql` | yes | `assets` + `replication_outbox` + `replication_state`, every statement `IF NOT EXISTS` | additive only |
| `0003_story_generation.sql` | yes | `project_profiles`, `story_bibles`, `episodes`, `generation_jobs`, `credit_accounts`, `credit_holds`, `credit_ledger` + 5 indexes, every statement `IF NOT EXISTS` | additive only |

Neither tracked migration contains `DROP`, `ALTER`, `DELETE` or `UPDATE`. `0003` deliberately puts the
project-profile fields in a **new** table so it never has to `ALTER` an existing one (SQLite has no
`ADD COLUMN IF NOT EXISTS`). **Applying `0002` and `0003` cannot destroy or alter existing data.**
There is, however, **no down-migration anywhere in the repository** — the only restore path is D1
time-travel / export, so capture a restore point before applying (it is a read-only step, §4.1).
**Verified available on 27 Oct 2026:** `bunx wrangler d1 time-travel info manhwa-studio` returned the
current bookmark and the exact `… d1 time-travel restore manhwa-studio --bookmark=<bookmark>` command
that undoes a bad apply.

### 3.2 The stray migration is a hard blocker (reproduced, not theorised)

```
$ bunx wrangler d1 migrations list manhwa-studio --remote
Migrations to be applied:
  0002_assets.sql
  0002_assets_and_replication.sql
  0003_story_generation.sql

$ bunx wrangler d1 migrations apply manhwa-studio --local
? About to apply 1 migration(s) …
✘ [ERROR] table assets already exists at offset 268: SQLITE_ERROR      # 0002_assets.sql
```

`0002_assets.sql` sorts **before** `0002_assets_and_replication.sql` (`.` `0x2E` < `_` `0x5F`), and it
contains a bare `CREATE TABLE assets` while the live database **already has** an `assets` table (§1.6).
wrangler **aborts at the first failure**, so on the remote database the same error would arrive first and
`0002_assets_and_replication.sql` and `0003_story_generation.sql` would **never be applied**. The remote
run was deliberately **not** attempted; the local instance reproduced it exactly.

**Resolution before any apply:** move or delete the untracked duplicate. Moving is reversible and is the
recommended form:

```bash
mv migrations/0002_assets.sql /tmp/0002_assets.sql.stray     # reversible
# or, if you are sure:  rm migrations/0002_assets.sql
```

Its schema intent is already covered by the tracked `0002_assets_and_replication.sql` (which additionally
creates `idx_assets_org` / `idx_assets_project`); the live database already carries the stray file's two
index names, so nothing is lost either way.

### 3.3 Bindings, identity, CORS, cookies, AI — what a deployment still needs

**Bindings — already declared and real:** `DB` → D1 `manhwa-studio` (`d9557398-…`), `FILES` → R2
`manhwa-studio-assets`. Nothing to create.

**Required variable NAMES (never values):**

| Name | Kind | Purpose | Status |
|---|---|---|---|
| `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN` | public vars | Sign in with Freebuff; `APP_ORIGIN` is also the first allow-listed origin | **not set** on the owner's account; the Freebuff site has its own injected pair |
| `ALLOWED_ORIGINS` | public var | comma-separated **exact** origins allowed to call the API cross-origin (the Vercel origin) | **not set** — required if the frontend is on another origin |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | **secrets** | server-side story generation; **both** required, no invented default | not set → generation honestly answers `provider_not_configured` and charges nothing |
| `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS` | optional vars | bound provider latency/output | not set (safe defaults 60 s / 4096) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **secrets** | secondary backup only; never the primary store | not set → backup reports `not_configured` |
| `VITE_API_BASE_URL` | public build var | frontend → API origin; **inlined into the bundle, never a secret** | empty in the live Vercel build |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | operator credential | `wrangler` deploy/migrate | present in the gitignored `.env.local` (values never read into any output) |

Never prefix a server-side value with `VITE_`: Vite inlines `VITE_*` into the browser bundle.

**OIDC client:** *not* configured on the owner's account. It **is** configured on the Freebuff site
(issuer `https://freebuff.com/oidc`, client `942e460d-c8fb-45f4-9005-8b497eb1c6a7`, project
`8e32244c-d7e8-45bb-b2e2-785f0402c951`), whose live `/auth/freebuff/signin` redirect proves the exact
callback shape: `https://<origin>/auth/freebuff/callback`. Registration is **owner-only** (it needs the
owner's Freebuff login) and is append-only, so the same client can cover a new origin by adding one
redirect URI.

**CORS:** `worker/src/origins.ts` is exact-match only — a wildcard is impossible by design because the
browser sends credentials. Every origin the frontend is served from must be listed (production **and**
each preview origin actually used), or the browser gets no CORS headers and every call fails. The live
deployment proves the cost of getting this wrong: **zero CORS headers exist there today** and the repo's
verifier fails two checks because of it.

**Cross-origin session cookies — the honest limitation.** The live sign-in sets
`__Host-freebuff_txn-…; Path=/; HttpOnly; SameSite=Lax; Secure`, and the session cookie follows the same
`__Host-` shape: **host-only**, `SameSite=Lax`. Therefore:

| Topology | Session cookie sent? | Sign-in works? |
|---|---|---|
| frontend and API on the **same origin** | yes | **yes** |
| `app.example.com` (Vercel) + `api.example.com` (Worker) — **same registrable domain** | yes | **yes** (needs `ALLOWED_ORIGINS` + a registered callback for the app origin) |
| `*.vercel.app` + `*.workers.dev` / `*.freebuff.page` — **different sites** | **no** | **no** — the app would load and every call would honestly 401 |

So `manhwa-beta.vercel.app` calling a `*.workers.dev` Worker **cannot sign in**, no matter how CORS is
configured. This is a cookie-topology fact, not a bug, and it is the reason the plan in §4 offers a
custom-domain path (the `oppa-technologies.online` zone is active on this very account) as the way to get
working sign-in with a separately hosted frontend.

**AI provider:** `worker/src/ai.ts` `providerFromEnv` requires **both** `GEMINI_API_KEY` and an explicit
`GEMINI_MODEL`; nothing is invented and there is no silent paid fallback. The key travels in an
`x-goog-api-key` header (never a URL), and output is bounded by timeout and token cap. Both variable
names are documented in `.env.example`. **Not configured anywhere** → generation is honestly unavailable
and free.

### 3.4 Functional gap found during the audit: nobody can get an organization

`firstOrganizationForUser` (`worker/src/tenancy.ts`) only **reads**
`organization_memberships`. Searching the whole repository, **every**
`INSERT INTO organizations` / `INSERT INTO organization_memberships` occurs in **test files only** —
there is no production route, command or seed that creates an organization or a membership. The remote
database has `organizations 0`, `users 0`.

Consequence: once sign-in works, every shared-workspace call answers
**403 `{"error":"forbidden","detail":"Not a member of any organization."}`** and the cloud workspace
stays unusable. **This is the one functional gap between "deployed and healthy" and "usable"**, and it
is a *code* task (a small, idempotent, server-side provisioning step), not a deployment step. It is
listed as the recommended next task.

---

## 4. Phase 4 — deployment checklist (prepared, NOT executed)

Ordered, and split by how reversible each step is. Nothing in groups 3–4 was executed by this task.

### Group 1 — safe read-only verification

```bash
export PATH="$HOME/.bun/bin:$PATH"
git fetch origin && git log -1 --oneline origin/main        # confirm the base first

# operator credential, loaded without printing it:
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)
bunx wrangler whoami                                        # 1 account
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/78bd087d85c6604c2dc25195a80eac91/workers/scripts"  # expect []

bunx wrangler d1 info manhwa-studio
bunx wrangler d1 migrations list manhwa-studio --remote     # 3 pending, incl. the stray 0002
bunx wrangler d1 execute manhwa-studio --remote --json \
  --command "SELECT id, name FROM d1_migrations ORDER BY id"          # exactly 0001
bunx wrangler d1 time-travel info manhwa-studio              # capture the restore point BEFORE any apply
bunx wrangler deploy --dry-run --outdir=/tmp/dryrun          # local bundle only, uploads nothing

node scripts/verify-deployment.mjs --api <API origin> \
  --origin <frontend origin> --frontend <frontend URL>       # must exit 0 before claiming success
```

### Group 2 — local development and testing

```bash
bun install --frozen-lockfile
bunx tsc --noEmit && bun run lint && bun run test && bun run build
mv migrations/0002_assets.sql /tmp/0002_assets.sql.stray     # REQUIRED before any apply
bunx wrangler d1 migrations apply manhwa-studio --local      # rehearsal on the disposable local DB
CI=true WRANGLER_SEND_METRICS=false bunx wrangler dev --port 8787 &
curl -s localhost:8787/healthz      # {"status":"ok"}
curl -s localhost:8787/readyz       # ready, d1 ok
```

### Group 3 — reversible configuration changes (owner)

1. **Worker public vars** — add to `wrangler.toml` `[vars]`: `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`,
   `APP_ORIGIN`, and `ALLOWED_ORIGINS` (the frontend origin(s), exact, comma-separated).
   `APP_ORIGIN` is always included automatically.
2. **Register the OIDC callback** for the deployment origin (append-only, one identity provider):
   `npx @freebuff/auth register … --redirect-uri https://<origin>/auth/freebuff/callback`
3. **Optional secrets:** `bunx wrangler secret put GEMINI_API_KEY` and `… GEMINI_MODEL` (typed
   interactively; never in a file, a flag or chat).
4. **Vercel:** set `VITE_API_BASE_URL` = the API **origin only** for Production **and** Preview, then
   redeploy (build-time value — an env change needs a new deployment).
5. **Rollback for all of the above:** `bunx wrangler rollback`; Vercel → previous deployment → Promote;
   revert the variable and redeploy.

### Group 4 — irreversible or production-impacting: **explicit owner authorization required**

| Step | Command | Why it needs approval |
|---|---|---|
| First Worker deploy (creates the script; with a dashboard visit, the `workers.dev` subdomain) | `bunx wrangler deploy` | publishes a live API; cannot be un-published without deleting the script |
| Apply the schema to the live database | `bunx wrangler d1 migrations apply manhwa-studio --remote` | live DDL; additive and `IF NOT EXISTS`, but there is no down-migration |
| Create the first organization + membership | `bunx wrangler d1 execute manhwa-studio --remote --command "INSERT …"` | a **write to production data**; must be the owner's own `sub` (see §3.4) |
| Attach a custom domain / route | `routes = [{ pattern = "manhwa-api.oppa-technologies.online", custom_domain = true }]` then deploy | a DNS/zone change on a live zone |
| Redeploy or unpublish the Freebuff site | `sites_deploy` / `sites_set_published(published: false)` | replaces/stops the only currently published deployment |

**Explicitly forbidden without new authorization:** deploying a production Worker, applying production
migrations, registering production auth clients, changing production variables or secrets, enabling any
paid service, spending AI credits, merging any PR, or modifying `main`.

---

## 5. Verification performed by this task

Everything below was executed today in this workspace. Nothing live was mutated.

| Check | Result |
|---|---|
| Remote script list, before and after all probes | **`[]`** — no Worker was created |
| `bunx wrangler whoami` | 1 account (`78bd087d…`), token type = Account API Token |
| D1 list / `info` / `migrations list --remote` / read-only `execute --json` | 1 database; 7 tables; **0001 applied**; 3 pending |
| R2 bucket list | `manhwa-studio-assets` |
| Zone list | `oppa-technologies.online` active |
| `bunx wrangler deploy --dry-run` | **192.20 KiB / gzip 44.12 KiB**; bindings `env.DB`, `env.FILES`; `--dry-run: exiting now` |
| `node scripts/verify-deployment.mjs` vs the **live** API + **live** Vercel frontend | **5/7, exit 1** — PASS liveness, PASS readiness (`d1=ok r2=ok auth=ok`), **FAIL** credentialed CORS read (no `Allow-Origin`), **FAIL** credentialed preflight (`OPTIONS` 404), PASS foreign origin refused, PASS SPA served, PASS SPA deep-link fallback |
| Migration-fold evidence | local apply → `table assets already exists at offset 268: SQLITE_ERROR`; the stray file stayed pending |
| `bunx wrangler d1 time-travel info manhwa-studio` | **restore point available** — returned the current bookmark plus the exact `d1 time-travel restore … --bookmark=<bookmark>` command |
| `bunx tsc --noEmit` / `bun run lint` / `bun run test` / `bun run build` | **0 / 0 / 0 / 0** — **317 pass, 0 fail**, 1068 assertions, 22 files |
| Live Freebuff probes (13 requests, GET/OPTIONS only) | §1.1 |
| `sites_list` / `sites_inspect` (read-only) | publication state, bindings, quota, receipts — §1.2, §1.3 |
| Live Vercel bundle inspection (read-only, 4 GETs) | §1.7 |
| Secrets | **no secret value was read, printed, logged or committed**; presence checked by name only |

**Not verified, and not claimed:**

- **No deployment, migration, registration, publication or rollback was performed.** Production status
  is exactly as found.
- **The owner's Worker has never run in production.** Its behaviour in workerd is proven by the dry-run
  bundle and local tests only; `/healthz`, `/readyz`, CORS and auth against the *owner's* origin are
  **unverified until deployed**.
- **Live sign-in is unverified** in every topology: no client is registered for a deployment origin we
  control, so 401/403 and cookie behaviour beyond the observed `__Host-…; SameSite=Lax` shape are
  unproven.
- **No live organization exists**, so the shared workspace provably cannot succeed end-to-end yet (§3.4).
- **No live AI generation** — `GEMINI_API_KEY`/`GEMINI_MODEL` are unset everywhere.
- **No real-browser check**; DOM tests assert structure, not pixels.
- **Vercel project internals are unknown** (no credentials) — branch, commit, env vars and protection
  settings could not be inspected.

---

## 6. TASK 08A — live backend re-verification (27 Oct 2026, read-only)

Same account, same credential, no deploy, no application-code change. This section answers 08A's six
questions with the evidence as measured.

### 6.1 Is a Manhwa Beta Worker deployed? **No — and no `workers.dev` URL can exist**

| Probe (read-only) | Actual result |
|---|---|
| `GET /accounts/78bd087d…/workers/scripts` | `{"result":[],"success":true,"errors":[]}` — **zero scripts** |
| `GET /accounts/…/workers/scripts/manhwa-studio-api` | **HTTP 404** `{"code":10007,"message":"This Worker does not exist on your account."}` |
| `GET /accounts/…/workers/scripts/manhwa-studio-api/deployments` | identical **`10007`** |
| `GET /accounts/…/pages/projects` | `{"result":[],…}` — **no Pages project** either (a Pages deploy would also be a live Worker) |
| `GET /accounts/…/workers/subdomain` | **error 10007** — "You do not have a workers.dev subdomain" |
| `bunx wrangler deployments list --name manhwa-studio-api` | `✘ [ERROR] … This Worker does not exist on your account. [code: 10007]` |
| DNS `manhwa-studio-api.workers.dev` | **NXDOMAIN** |

**Why the empty list is authoritative rather than a permission artifact:** the named-script probe answers
**`404` / `10007` "does not exist"**, not `403` / error `10000`. A token without Workers read scope
produces a permission error; this token reads the account's Worker namespace and reports *not found*. So:

- **real deployed name:** none — `manhwa-studio-api` exists only as `name = "manhwa-studio-api"` in `wrangler.toml`;
- **deployment status:** not deployable-to-inspect — `wrangler deployments list` cannot enumerate it;
- **`workers.dev` URL:** **none, and none is possible**, because the account has no `workers.dev` subdomain.
  One is minted by opening Workers & Pages once in the dashboard; the alternative is a custom-domain route.

### 6.2 Deployed vs configuration-only vs local-only

| Piece | **Deployed (live, over the internet)** | In configuration only | Local development only |
|---|---|---|---|
| API Worker | Freebuff-platform Worker `site-ad1c922229fc492d966ca1d060a96319`, published 2026-10-22T11:25:44Z on platform account `6e5a40dd9362fb315de7ecbaad2ca12b` | `name = "manhwa-studio-api"` (never uploaded) | bundles to 196,813 B via `deploy --dry-run --outdir=/tmp` |
| D1 | **platform** D1 `site-1d7d701600f44a05bc02ddd6ce56d288` (bound to the deployed Worker) | `DB` → owner's `manhwa-studio` `d9557398-b439-463a-b5aa-a3703d5c3fdb` — **exists but nothing binds it** | `.wrangler/state` copy (disposable) |
| R2 | **platform** R2 `site-8179e1b534df41b4a059b13ebb2aaba6` | `FILES` → owner's `manhwa-studio-assets` — **exists but nothing binds it** | in-memory double in tests |
| Identity | Freebuff OIDC client `942e460d-c8fb-45f4-9005-8b497eb1c6a7`, issuer `https://freebuff.com/oidc`, callback `https://site-ad1c92…/auth/freebuff/callback` | — nothing configured on the owner's account | injected test doubles |

**Therefore: the owner's D1 and R2 are reachable with the owner's credentials (list + real SQL read
succeeded, and the dry-run resolves both bindings) but they are *not* attached to any deployed Worker —
no Manhwa Beta Worker exists to attach them to.** The deployed Worker uses *different* (platform)
resources, which is the duplicate-store problem flagged in §1.3.

### 6.3 Read-only HTTP against the one live backend

```
GET /healthz  → HTTP 200  application/json  {"status":"ok"}

GET /readyz   → HTTP 200  application/json
{"status":"ready","checks":{
  "d1":   {"status":"ok","detail":"D1 binding answered SELECT 1."},
  "r2":   {"status":"ok","detail":"R2 binding attached (bucket manhwa-studio-assets)."},
  "auth": {"status":"ok","detail":"Sign in with Freebuff client configured."}}}
```

### 6.4 Authentication status (no secret read or printed)

- On the **deployed platform Worker**: configured — `auth: ok`, client `942e460d-…` (a *public* OIDC
  client id, already recorded in `FREEBUFF_DATABASE_ACCESS_PROBE.md`), sign-in returns `303` with an
  HttpOnly `__Host-freebuff_txn-…` cookie (`SameSite=Lax`). No client secret exists for this SDK.
- On the **owner's account**: **nothing configured** — no Worker, therefore no vars and no secrets;
  `FREEBUFF_CLIENT_ID` / `FREEBUFF_ISSUER` / `APP_ORIGIN` appear nowhere but `.env.example` placeholders.
  Credential checks were by **presence of the name only**; no value was printed, logged or committed.

### 6.5 Three caveats that make `/readyz` weaker evidence than it looks

1. The `r2` detail string `"R2 binding attached (bucket manhwa-studio-assets)."` is a **hardcoded literal
   in `worker/src/index.ts`**; the live Worker is actually bound to `site-8179e1b5…`. Read the
   parenthetical as the code's own text, **not** as proof of which bucket is attached.
2. `d1: ok` means a `SELECT 1` succeeded, and **`SELECT 1` succeeds on an empty database** — so it does
   **not** prove the tenancy schema exists. The platform D1's schema cannot be inspected from here.
3. The REST field `num_tables` is stale: `GET /d1/database` reported `num_tables: 0` for the owner's
   database while an actual SQL read returned **7 tables** (`wrangler d1 info` agrees). Trust the SQL.

### 6.6 What is missing, and the prepared commands

**Missing, in dependency order:** (1) the Worker script itself — never deployed; (2) a hostname — no
`workers.dev` subdomain, or a custom-domain route; (3) migrations `0002`/`0003` on the owner's D1
(**and** removal of the untracked `migrations/0002_assets.sql`, which aborts the apply — §3.2); (4) an
OIDC client for the new origin plus the `FREEBUFF_*` / `APP_ORIGIN` / `ALLOWED_ORIGINS` vars;
(5) optional `GEMINI_API_KEY` + `GEMINI_MODEL`; (6) the organization-provisioning gap (§3.4).

Every prepared command below was **executed in this verification** and behaved as annotated; none of them
uploads anything or mutates production:

```bash
export PATH="$HOME/.bun/bin:$PATH"
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)   # never printed
bunx wrangler whoami                          # 1 account: 78bd087d85c6604c2dc25195a80eac91
bunx wrangler deploy --dry-run --outdir=/tmp  # 192.20 KiB, gzip 44.12 KiB; env.DB + env.FILES resolved; "--dry-run: exiting now"
bunx wrangler d1 migrations list manhwa-studio --remote    # 0002_assets.sql, 0002_assets_and_replication.sql, 0003_story_generation.sql
bunx wrangler d1 time-travel info manhwa-studio            # restore point available immediately before any apply
bunx wrangler d1 execute manhwa-studio --remote --json --command "SELECT id, name FROM d1_migrations ORDER BY id"  # exactly 0001
```

Then, **only with authorization**: `wrangler deploy`, `mv migrations/0002_assets.sql /tmp/`,
`wrangler d1 migrations apply manhwa-studio --remote`, the vars/secrets and the OIDC registration — the
grouped checklist is §4.

### 6.7 State after this verification

Unchanged from §1: **zero** Worker scripts, **one** D1, **one** R2, `d1_migrations` holding **exactly
one** row, and the platform site still the only published Manhwa backend. The dry-run wrote only to
`/tmp`. Nothing was deployed, migrated, registered or configured.

---

## 7. Explicitly not done

No merge into `main`, no PR merge, no force-push, no Worker deploy, no remote migration, no production
data write, no OIDC registration, no secret or production setting changed, no paid service enabled, no AI
credit spent, and no modification of `main` or of any existing task branch. The working tree still
contains the untracked `migrations/0002_assets.sql` (§3.2), deliberately left in place rather than
deleted — moving it is step 1 of Group 2 above.

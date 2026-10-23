# Freebuff Database Access Probe — Evidence Report

**Subtask:** FREEBUFF DATABASE ACCESS PROBE (executed after ROADMAP TASK 02, per owner instruction)
**From:** probe agent **To:** repository owner + next roadmap agent
**Date:** 22 October 2026 (probes run 13:35–13:43 UTC)
**Branch:** `task/TASK-01-reconcile-ci` — **documentation-only commit; no application, schema, auth or deployment-config change**
**Owner question:** “Can the Manhwa Beta backend securely access and query Freebuff's built-in database through a supported interface?”

## Verdict — PARTIALLY VERIFIED (split answer, both halves evidence-backed)

- **From a Freebuff-deployed Worker using the `env.DB` binding: YES — VERIFIED LIVE TODAY.** The owner's
  already-published Freebuff Site (`Manhwa-beta`, production) runs this repository's
  `manhwa-studio-api` Worker, and its `/readyz` executed a **real `SELECT 1` against the
  Freebuff-managed D1 database and returned HTTP 200** (`d1: ok`). Read access through the supported
  interface is proven from the actual production execution environment, over the public internet.
  Classification for this path: **F** — real query succeeds; write access unverified (not attempted:
  it would require a migration into a production database, which this probe was not authorized to do).
- **From any external backend (Vercel, or this repository's standalone Worker on the owner's own
  Cloudflare account): NO — UNSUPPORTED.** No documented HTTP API, SDK, connection string or Postgres
  endpoint exists. Classification for this path: **A** — no supported external database interface
  could be found, after checking Freebuff's own (nonexistent) documentation surface, the npm registry,
  the platform's own tooling contract, and the live project configuration.

**Write/read-back: NOT verified (F, not G).** **Cloudflare Workers can access the service: YES —
demonstrated by the live deployment itself.**

---

## 1. What Freebuff database interface was investigated

Four candidate interfaces, in the order the platform presents them:

1. **The site Worker `env.DB` binding** — the interface the platform's own Sites tooling documents:
   `sites_add_storage` “provisions D1 (SQLite SQL via env.DB) … These are Workers bindings, not
   browser SDKs or PostgreSQL connections. Query them on the server; use bound SQL parameters.”
2. **A documented database HTTP API / REST / SQL endpoint** for external backends (Vercel, a
   standalone Cloudflare Worker) to query a project's built-in database.
3. **An official SDK** — anything beyond `@freebuff/auth` that could reach database records.
4. **A database connection endpoint / connection string / Postgres wire endpoint** for the
   built-in database.

## 2. Documentation and code evidence

**Freebuff's public documentation surface does not exist.** Every path that would host it was
probed from this environment on 22 Oct 2026:

| URL | Result |
|---|---|
| `https://freebuff.com/` | 200 — marketing page only (“Instant database”, “Database, Storage, Auth”) |
| `https://freebuff.com/docs` | **404** |
| `https://docs.freebuff.com` | **DNS does not resolve** (NXDOMAIN) |
| `https://freebuff.com/sitemap.xml` | Only marketing pages (`/`, `/chat`, `/pricing`, `/app-builder`, `/get-started`, `/login`, `/signup`, `/enterprise`, `/teams`) |
| `https://help.freebuff.com` | **404** |
| `https://app.freebuff.com/login` | 200 — login screen; the in-product database dashboard is behind auth |

**npm registry (22 Oct 2026):** `@freebuff/auth@1.0.4` is the only relevant package; its provenance
is `github.com/freebuff/freebuff/apps/bff` (auth service source), published 30 Sep 2026. Its exports
are OIDC `user()` and a realtime websocket ticket — grepping the shipped `.d.ts` and `package.json`
for `d1|database|sql|supabase` returns **nothing**. Registry-wide searches for freebuff database/SQL
ORM/SDK packages return no Freebuff-published database client.

**Cloudflare's generic D1 REST API exists** (`https://developers.cloudflare.com/api/resources/d1/`,
D1 import/export tutorials) **but requires an API token scoped to the Cloudflare account that owns
the database**. As `sites_inspect` shows, the Freebuff-managed database belongs to Freebuff's
platform account `6e5a40dd9362fb315de7ecbaad2ca12b` (namespace `freebuff-sites-prod`), not the
owner's account `78bd087d85c6604c2dc25195a80eac91`. The owner cannot legitimately obtain credentials
for that account, and using them would not be a Freebuff-supported interface in any case.

**Conclusion from evidence:** the supported interface is (1) and only (1) — a binding inside a Worker
deployed by Freebuff Sites. Every other path is either undocumented (404/NXDOMAIN), nonexistent (no
SDK), or blocked at the Cloudflare account boundary.

## 3. Is the interface officially supported?

- `env.DB` binding: **yes**, it is the platform's documented primary interface (Sites tooling
  contract, quoted verbatim above), and its behavior was confirmed against the live deployment.
- External HTTP/SDK/connection-string access: **no evidence of support exists anywhere**; absence was
  established from the platform's own docs surface (404/NXDOMAIN/sitemap), the npm registry, and the
  live project configuration — not from a single failed attempt.

## 4. The actual test environment

- **Probe host:** this Freebuff Cloud VM (outbound HTTPS confirmed: `api.cloudflare.com` answered
  HTTP 400 `Missing "Authorization" header` — DNS and TCP work; no credentials were supplied).
- **Target:** the owner's **already-published production site**, probed with unauthenticated public
  GETs only, 6 requests total, no writes:
  - Site: `Manhwa-beta` (`siteId e2c278d1-f97b-4990-9b14-3df3d60b3997`), created 22 Oct 11:25 UTC via
    the Freebuff web app, **published** at `https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page`
  - Worker: `site-ad1c922229fc492d966ca1d060a96319` on account `6e5a40dd…` (Freebuff platform)
  - Bindings (from `sites_inspect`): **`DB` → D1** (`site-1d7d701600f44a05bc02ddd6ce56d288`),
    **`FILES` → R2** (`site-8179e1b534df41b4a059b13ebb2aaba6`); auth configured
    (issuer `https://freebuff.com/oidc`, client `942e460d-c8fb-45f4-9005-8b497eb1c6a7`)
  - Quota at 13:21 UTC: **d1Bytes 180,224 used; d1Reads 595/month; d1Writes 54/month** — the database
    is real and holds data
- The deployed root banner (`{"service":"manhwa-studio-api","phase":"TASK-07 D1 + tenancy foundation",…}`)
  matches `worker/src/index.ts` verbatim, so the production site runs **this repository's Worker
  code**. The exact deployed source commit could not be verified from the platform side.

## 5. Exact tests performed and results

| # | Test | Result |
|---|---|---|
| 1 | `GET /` | **200** — service banner identical to `worker/src/index.ts` |
| 2 | `GET /healthz` | **200** `{"status":"ok"}` |
| 3 | `GET /readyz` (twice, 13:36 and 13:42:36 UTC) | **200** — `d1: ok, "D1 binding answered SELECT 1."`; `r2: ok`; `auth: ok, "Sign in with Freebuff client configured."` |
| 4 | `GET /api/v1/me` (no session) | **401** `{"error":"unauthorized"}` — auth enforced |
| 5 | `GET /api/v1/assets` (no session) | **401** — tenant isolation intact |
| 6 | `sites_inspect` production | bindings, account boundary and D1 quota captured (section 4) |
| 7 | `api.cloudflare.com` reachability | HTTP 400 (missing auth header) — network fine, no credentials used |
| 8 | Docs-host probes | 404 / NXDOMAIN / marketing-only sitemap (section 2) |

**What test 3 proves:** `/readyz` calls `env.DB.prepare('SELECT 1 AS ok').first()` on every request —
the HTTP 200 with `d1: ok` is a real query executed against the Freebuff-managed D1, inside the
production Cloudflare Worker, over the public internet. It is not a mock, a compile, or a local
workerd run. Reproduced twice for stability.

**Honesty caveat found during the probe:** the `r2` detail string
(`"R2 binding attached (bucket manhwa-studio-assets)."`) is **hardcoded in `worker/src/index.ts`**;
the fact asserted (binding attached) is real, but the bucket-name string comes from source and does
not match the actual Freebuff-provisioned bucket name (`site-8179e1b5…`). Flagged for a future
honesty sweep; not changed here (documentation-only subtask).

## 6. Real read access — verified?

**Yes**, for the supported path: `SELECT 1` succeeded twice against the production-bound D1 via the
`env.DB` binding (test 3). **No** external read path exists to verify (section 2).

## 7. Real write/read-back — verified?

**No — and deliberately not attempted.** The published database is production (published site, 180 KB
of real data, 54 writes this month). Creating a test table there is a migration into production,
which this subtask is explicitly not authorized to perform. Required setup if the owner wants the
write half proven: (a) explicit owner authorization, then (b) either a dedicated, uniquely named test
table created by an authorized migration on a **preview** environment (the site's preview environment
exists but is currently undeployed — deploying it is also an owner decision), or (c) a disposable
test table on production created and dropped within the probe, with the owner's sign-off. Until
then the correct classification is **F, not G**.

## 8. Can Cloudflare Workers access the service?

**Yes — already demonstrated in production.** The published `manhwa-studio-api` Worker on Freebuff
Sites queries the bound D1 on every `/readyz` call and serves `/api/v1/*` with auth enforcement.
The intended integration (Freebuff-hosted Worker ⇄ `env.DB`) is live and working today.

## 9. Missing credentials, permissions or configuration

- **External access:** not a missing-credential problem — the interface itself does not exist. The
  only conceivable external route (Cloudflare's account-scoped D1 REST API against Freebuff's
  platform account) is blocked at the account boundary and should remain so.
- **Write verification:** missing owner authorization for a production-touching test (section 7).
- **No credentials were used, requested or exposed by this probe.** The repo's own
  `CLOUDFLARE_API_TOKEN` was not needed (`.env.local` is absent in this workspace) and was never read.

## 10. Security concerns and platform limitations

- **Two divergent databases now exist** — the Freebuff-managed D1 (`site-1d7d7016…`, live, has data)
  and the repo's `wrangler.toml` D1 (`manhwa-studio`, `d9557398-b439-463a-b5aa-a3703d5c3fdb`, on the
  owner's own account). They are not the same database. Any dual-host design must pick **one**
  authoritative store; two copies would violate the owner's “no competing copies of customer data”
  requirement.
- `/readyz` is public and discloses sanitized infrastructure state (which dependencies are live).
  Recommended to keep — it exposes no connection details — but the owner should consciously re-affirm
  that choice for production.
- Freebuff's built-in database is **structurally inaccessible to Vercel** or any backend outside the
  site's own Worker. This is a platform boundary, not a bug or a missing configuration.
- The deployed production site was deployed via the Freebuff web app (not from this repository's
  terminal), and the deployed commit SHA is unverifiable from the platform side.

## 11. Was the diagnostic endpoint created?

**No — deliberately, under the subtask's own “only if justified” rule.** A
`/api/v1/diagnostics/freebuff-database` route in this repository's standalone Worker would have
nothing real to measure: that Worker has no supported path to Freebuff's D1 (that is the finding).
Deploying any code to the Freebuff site to host the endpoint is a deployment, which this subtask is
not authorized to perform. The **existing `/readyz`** already performs exactly the sanctioned
diagnostic — a harmless documented read (`SELECT 1`), a short timeout, sanitized status-only output,
no credentials, no caller-supplied SQL or table names, no customer rows — and it is the interface the
probe used. Adding a second, redundant endpoint would have been dead code.

## 12. Disabled by default / protection

Not applicable (no endpoint added). For the record, the probe required and used **no**
authentication, introduced no new route, and weakened no existing guard: `/api/v1/me` and
`/api/v1/assets` still return 401 without a session on the live site (tests 4–5).

## 13. Recommended next step

Note on task numbering (corrected 22 Oct, same day): the dual-host feasibility investigation named in
`docs/handoffs/ROADMAP-TASK-02-HANDOFF.md` §9 is **not** roadmap TASK 03 — roadmap TASK 03 is
“Authentication + prove tenant isolation”. The two are prerequisites for each other and are referred to
by their full names below to avoid the conflation an earlier draft of this report introduced.

**Feed this evidence into the dual-host feasibility investigation and let the owner choose the
authoritative backend before any implementation:**

1. **Option A — Freebuff-deployed Worker is the single backend** (now proven workable): both the
   Vercel frontend and the Freebuff frontend call the same published Worker over HTTPS; the
   Freebuff-managed D1 is authoritative; Supabase Postgres is fed by an explicit export/backup job
   running inside that Worker. Identity: the Freebuff OIDC client already configured on the site
   becomes the one identity provider for both hosts (multi-origin redirect URIs must be registered).
2. **Option B — the owner's standalone Worker (own Cloudflare account, own D1) is the single
   backend**: Freebuff's built-in database is not used as primary at all; the Freebuff-hosted build
   is frontend-only and calls the standalone Worker, same as Vercel. This keeps one D1, one R2, one
   credit ledger under the owner's direct control, and the Supabase backup job runs on the
   standalone Worker.

Either option satisfies “one backend, one database, one identity”; only Option A uses Freebuff's
built-in database as primary, and Option A is now evidence-backed. **Do not begin the dual-host
implementation — or roadmap TASK 03 (Authentication + prove tenant isolation) — without the owner's
instruction** (rule still in force from TASK 01/02 handoffs).

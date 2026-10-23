# Dual-Host Feasibility Investigation (Vercel + Freebuff, one backend)

**Task type:** Investigation only — **no implementation, no deployment, no merge, no auth/schema/CORS change**
**From:** investigation agent **To:** repository owner
**Date:** 22 October 2026 (all live probes 13:35–14:10 UTC)
**Branch:** `task/TASK-01-reconcile-ci` — based on `c1b6971` (Freebuff database access probe)
**Companion evidence:** `docs/audits/FREEBUFF_DATABASE_ACCESS_PROBE.md` (read first: it proves where the
database can and cannot be reached)
**Named as next task by:** `docs/handoffs/ROADMAP-TASK-02-HANDOFF.md` §9

**Recorded product direction (context, not authorization):** two separately hosted versions of the same
application — one on Vercel, one on Freebuff — sharing one authoritative backend, one database, one
authentication identity, one set of projects/credits/job state; no competing copies of customer data;
no divergent behavior between hosts. This document answers whether that shape is feasible and what it
would take. It implements none of it.

## 1. What exists today (verified, not assumed)

| Component | State | Evidence |
|---|---|---|
| Frontend | Vite static SPA, `localStorage` only, zero network calls in `src/` | honesty tests (`bun run test`, 59 pass) |
| Backend | Hono Worker `manhwa-studio-api` (`worker/src/index.ts`) | repo source |
| Freebuff-hosted deployment | **Live and published**: `https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page` runs this repo's Worker; `/`, `/healthz`, `/readyz` all 200 | probe report §4–5 |
| Bindings on that deployment | `DB` → D1 `site-1d7d7016…` (Freebuff account `6e5a40dd…`), `FILES` → R2 `site-8179e1b5…` | `sites_inspect` |
| OIDC client | **Registered and live** on the deployment (issuer `https://freebuff.com/oidc`, client `942e460d-c8fb-45f4-9005-8b497eb1c6a7`); sign-in redirect works | §4 live capture |
| SPA on Freebuff | **Not served** — `/index.html`, `/favicon.ico`, `/assets/` all 404; the site exposes only the API | live probes 22 Oct |
| Why it is API-only | The platform's own build of this repo (`freebuff-sites-build/`, marker `.freebuff-generated`, 22 Oct 11:25 UTC) ran `vite build` successfully but emitted a **Worker-only manifest**: `spa: false`, no assets entry (`manifest.json`). Serving the SPA appears to be a deploy-manifest decision, not a missing toolchain | `freebuff-sites-build/build.log`, `manifest.json` |
| SPA on Vercel | **Nothing yet** — no `vercel.json`, no deployment; the build is a plain static `dist/` | repo tree |
| Owner's own Cloudflare Worker | Not deployed (docs say so; not re-verified) | `docs/DEPLOYMENT.md` |
| Databases | **Two D1s exist**: Freebuff-managed `site-1d7d7016…` (live, 54 rows written this month) and the repo's `manhwa-studio` `d9557398…` on the owner's account | probe report §10 |

**Consequence:** the “Freebuff-hosted version” today is an **API-only** deployment with working auth
and a real database; the “Vercel-hosted version” does not exist yet. Neither frontend talks to any
API yet. `freebuff-sites-build/` is untracked, platform-generated output (ignored via one
`.gitignore` line the platform added — see §8).

## 2. Identity (OIDC) — what the evidence shows

**2.1 The sign-in flow works on the live Freebuff deployment.**
`GET /auth/freebuff/signin` → **303** to `https://freebuff.com/oidc/authorize` with
`response_type=code`, `client_id=942e460d-…`, `redirect_uri=https%3A%2F%2Fsite-ad1c922229fc492d966ca1d060a96319.freebuff.page%2Fauth%2Ffreebuff%2Fcallback`,
`scope=openid email profile`, `state`, `nonce`, `code_challenge` (PKCE S256), plus a
`__Host-freebuff_txn-…` cookie (`Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`).
`GET /auth/freebuff/session` (unauthenticated) → `200 {"user":null}`.

**2.2 The callback origin is single-origin by construction.** In the pinned SDK
(`@freebuff/auth@0.1.0`, the exact version in `bun.lock`; source: published tarball `dist/`):

- `callbackUrl = origin + /auth/freebuff/callback` where `origin` comes from **one** `baseUrl`
  option (`index.js` L147–162), which “must be an origin, without a path”.
- The repository's `worker/src/auth.ts` caches **one** auth instance per isolate keyed by
  `clientId|issuer|APP_ORIGIN` — i.e. one sign-in origin per Worker deployment.

**2.3 Multiple redirect URIs are officially supported — append-only.** The SDK's own CLI help
(`dist/cli.js` L7–14):

```
npx @freebuff/auth register --project <slug> --name "<Display Name>" \
  --environment <production|development> --redirect-uri <url> [--redirect-uri <url>...]
… and a client only ever gains redirect URIs.
```

Platform behavior corroborates it: preview and production share one OIDC production client with
exact per-environment callbacks; localhost gets a separate development client. So a second host's
callback **can** be registered on the same client; nothing needs to be invented.

**2.4 The session cookie cannot cross unrelated sites.** SDK cookie construction
(`index.js` L159–169), verbatim behavior:

- Name: `__Host-freebuff_session` when the connection is secure — the `__Host-` prefix **forbids a
  `Domain` attribute**, so the cookie is host-only for exactly the backend host.
- Attributes: `Path=/; HttpOnly; SameSite=Lax; Secure`.

Browser consequence, which is the crux of the whole question:

| Frontend origin → backend origin | Same-site? | Lax cookie sent on `fetch`? |
|---|---|---|
| `something.vercel.app` → `site-….freebuff.page` | **No** — different registrable domains | **No** (Lax allows only top-level navigations cross-site) |
| `app.<owner-domain>` → `api.<owner-domain>` (custom domains, one parent) | Yes | **Yes**, with `credentials: 'include'` (host-only cookie still only travels to its own host, which is where the requests go) |

So the current identity design works **on each host's own origin**, and works **between two
same-site custom domains**, but **cannot** carry a session from `*.vercel.app` to
`*.freebuff.page` in a `fetch`. This is a browser-platform rule, not a Freebuff limitation, and no
amount of backend configuration changes it.

**2.5 One honest defect found (recorded, not fixed — investigation scope):**
`worker/src/index.ts` L80–95 comment claims the `app.all('/auth/freebuff/*')` branch is “only
reached when not configured”, and its body says client IDs “must be registered”. Live evidence:
on the deployment **with auth configured** (`/readyz` reports `auth: ok`), `GET
/auth/freebuff/login` returned that very 503 `auth_not_configured` JSON — because `/login` is not
an SDK route at all (the SDK handles only `/signin`, `/callback`, `/signout`, `/session` —
`index.js` `handle()`), so any unknown `/auth/freebuff/*` path falls through to this branch
regardless of configuration. Misleading message + wrong comment. Belongs in the next honesty
sweep; changing it now would be an application change outside this task.

## 3. CORS and cross-origin access — what the evidence shows

All probes 22 Oct 2026, against the published production site:

| Test | Result |
|---|---|
| `OPTIONS /api/v1/assets` with foreign `Origin` (preflight) | **404**, no `Access-Control-*` headers |
| `GET /api/v1/me` with foreign `Origin` | 401, **zero** `Access-Control-*` headers |
| `PUT /api/v1/assets` with `Origin: https://evil.example` | **403** `{"error":"forbidden","detail":"Mutations only allowed from the app origin."}` — the same-origin guard fires **before** auth, as designed |
| `PUT /api/v1/assets` with no `Origin` | 401 (route exists; auth gate) |
| `POST /api/v1/assets` | 404 — asset creation is **PUT** in this API (`worker/src/assets.ts` L231), by existing convention; not a bug |
| Repo source grep for CORS code | **No** CORS handling anywhere in `worker/src/` |
| SDK grep for `OPTIONS`/`Access-Control` | **0 matches** |

**Conclusion:** a browser on Host B **cannot read any response** from Host A today — no preflight,
no `Access-Control-Allow-Origin`, and mutations are additionally rejected by the single-`APP_ORIGIN`
guard (`assets.ts` L242–253, L333–339, one string, exact match). Dual-host requires an explicit
**origin allow-list** (never `*`) plus CORS response headers with
`Access-Control-Allow-Credentials: true` for exactly the allowed origins — **or** an architecture
where the browser never makes a cross-origin call (§6). Neither exists; both are changes for a
future implementation task.

## 4. Data plane — inherited from the probe, binding here

- Freebuff's built-in D1 is reachable **only** inside the Freebuff-deployed Worker via `env.DB`
  (probe classification: supported there; no external interface — classification A for Vercel or
  any external service). **Vercel cannot query it at all.**
- Therefore “one authoritative backend” is not optional: some single Worker must own all reads and
  writes, and both frontends must call **it**.
- The Supabase Postgres backup must likewise be written **server-side from that authoritative
  Worker** (export job), never directly from Vercel. (A provider-directory lookup for Supabase
  returned no catalog entry this run; the owner has already chosen Supabase, so integration details
  are deferred to the implementation task rather than designed here.)
- **Two D1s already diverge** (§1): the published site writes to Freebuff's `site-1d7d7016…`
  (54 rows this month) while `wrangler.toml` points at the owner's `manhwa-studio`. Picking the
  authoritative one is a prerequisite, not a detail.

## 5. Candidate shapes (analysis only — none implemented, none chosen)

| | **Shape A — Freebuff Worker is the API** | **Shape B — owner's standalone Worker is the API** |
|---|---|---|
| Freebuff frontend | SPA assets deployed to the Freebuff site alongside the Worker (today's manifest is Worker-only — §1; requires an assets-enabled deploy) | SPA-only Freebuff site calling the external Worker |
| Vercel frontend | static SPA calling the Freebuff Worker | static SPA calling the standalone Worker |
| Database | Freebuff-managed D1 (already live, already has data) | owner's D1 (own account, full API-token control — Cloudflare's REST API works here, unlike Freebuff's account) |
| Cookie story | Vercel origin is cross-site → **needs same-site custom domains** (`app.`/`api.` under one parent) **or** a per-host proxy (§6) | same options |
| CORS | required on the Worker (allow-list, credentials) | required on the Worker (allow-list, credentials) |
| OIDC callbacks | register both origins' callbacks on the one client (append-only, §2.3) | same |
| New infra risk | platform-hosted database + platform limits (probe §10) | owner operates everything; Freebuff built-in DB unused as primary |

Both shapes satisfy “one backend, one database, one identity” **iff** three gaps are closed (§7).

## 6. Two patterns that avoid cross-site cookies entirely (worth considering)

1. **Same-site custom domains** — the owner puts both hosts under one registrable domain
   (e.g. `app.<domain>` on Vercel, `api.<domain>` as the Freebuff site's custom domain). Cookies
   become same-site (§2.4); CORS is still needed (different origins) but credentials now work.
2. **Per-host same-origin proxy** — each host serves `/api/*` as a proxy to the single Worker, so
   the browser is always same-origin: no CORS, cookies natural. Cost: the OIDC callback/`baseUrl`
   differs per host, and today's auth instance is single-`APP_ORIGIN` per Worker (§2.2) — the
   backend must learn which origin a request came through. Design work, not a config flip.

## 7. Gap list for the implementation task (what “feasible” actually costs)

1. **Choose A or B** and **choose the authoritative D1** (§1, §5) — owner decision, blocks everything.
2. **Origin allow-list + CORS** on the Worker: exact origins (never `*`), credentials, preflight for
   PUT/DELETE, integrated with the existing same-origin mutation guard (§3).
3. **Cookie/topology decision**: same-site custom domains vs per-host proxy vs an explicitly
   documented bearer-token alternative (§2.4, §6). Do not hand-roll OAuth; extend the SDK contract.
4. **Register the second host's OIDC callback** via `npx @freebuff/auth register --redirect-uri …`
   (owner login; append-only, §2.3).
5. **Deploy the SPA to both hosts**: Freebuff needs an assets-enabled manifest (its current build
   is `spa: false`, Worker-only — §1, though the platform's `vite build` already succeeds); Vercel
   needs its standard static build config. Point both at the one API.
6. **Supabase backup job** runs inside the authoritative Worker; Vercel never touches either
   database (§4).
7. **Honesty sweep**: fix the `/auth/freebuff/*` fall-through comment + message (§2.5) and the
   hardcoded R2 bucket string recorded in the probe handoff §4.

## 8. What this investigation did NOT do

No code, dependency, schema, auth, CORS or deployment-config change. No deploy, no migration, no
merge, no PR, no client registration, no provider account created, no roadmap TASK 03 work. All
probes were unauthenticated public GETs/OPTIONs/PUTs against the already-published site (the PUTs
were rejected by design and wrote nothing); no credentials were read or used. The working-tree
edits in this task's commit are Markdown only: this report, its handoff, and two same-day
corrections to the probe report/handoff that fixed an earlier conflation of this task with roadmap
TASK 03 (“Authentication + prove tenant isolation” — a separate, still-blocked prerequisite).

**One disclosed exception, not created by this task:** the commit also carries a single
`.gitignore` line (`/freebuff-sites-build/`) that the Freebuff platform added on 22 Oct 11:25 UTC
when it generated the `freebuff-sites-build/` build directory (`.freebuff-generated` marker). It
was left uncommitted on the branch; it ignores generated build output only (including a bundled
`index.js.map`), touches no source, and is included so the branch ends clean. `freebuff-sites-build/`
itself stays untracked.

## 9. Owner decision points (blocked until answered)

1. **Shape A or Shape B** (§5) — determines which database becomes authoritative.
2. **Domain strategy** (§2.4, §6): same-site custom domains, per-host proxy, or accept that
   `*.vercel.app → *.freebuff.page` cookie sessions cannot work and choose accordingly.
3. **Which origin is the OIDC callback home** for each host (§2.3) — and who runs
   `npx @freebuff/auth register`.
4. Whether roadmap TASK 03 (auth + tenant-isolation verification against a real session) proceeds
   **before** dual-host implementation, as its own handoffs require.

## 10. Recommended next step

Answer §9.1–§9.2 (Shape + domain strategy); then a single implementation task can deliver gaps
§7.2–§7.5 in one coherent change set, gated by the existing 59 tests plus new origin-allow-list
and cross-origin tests. Roadmap TASK 03 remains the prerequisite for claiming verified sign-in and
two-tenant isolation against a real session — **do not start either implementation without the
owner's explicit instruction**, and do not merge or deploy anything to get there faster.

# Vercel deployment guide — Manhwa Studio frontend

**Status of this document:** written and verified against the repository on 24 October 2026.
It describes a deployment that **has not been performed**. Nothing in this task deployed,
merged, migrated, or changed a production setting.

Read this with `docs/DEPLOYMENT.md` (the Worker/API deploy procedure) and
`README.md` (honest capability status).

---

## 1. What is being deployed, and what it talks to

| Piece | Where it runs | Repository source | State |
|---|---|---|---|
| Frontend (this repo's React SPA) | **Vercel**, static | `src/`, `index.html`, `vercel.json` | built and tested locally; **not deployed** |
| API | **Cloudflare Worker** (Hono) | `worker/`, `wrangler.toml` | deployed only as the owner's Freebuff site (`site-ad1c92…freebuff.page`); the owner's own `manhwa-studio-api` Worker is **not deployed** |
| Database | **D1** (`DB` binding) | `migrations/` | schema committed; migrations **not applied** to any newly created database |
| Files | **R2** (`FILES` binding) | `worker/src/assets.ts` | bound in `wrangler.toml` |
| Identity | **Sign in with Freebuff** (OIDC) | `worker/src/auth.ts` | client registered only on the Freebuff-hosted deployment |

The Vercel frontend is a **static** build. It has no server runtime, no proxy, and no
credentials of its own. Every server-backed feature is reached by the browser calling the API
origin configured at build time.

---

## 2. Vercel project settings (copy exactly)

| Setting | Value |
|---|---|
| Root Directory | repository root (leave empty / `./`) |
| Framework Preset | `Vite` |
| Install Command | `bun install --frozen-lockfile` |
| Build Command | `bun run build` |
| Output Directory | `dist` |
| Node.js Version | 22.x or 24.x (any LTS; no Node API is used at runtime) |
| Package manager | Bun, auto-detected from the committed `bun.lock` |

These are also committed in [`vercel.json`](../vercel.json), so a project connected to this
repository picks them up even if the dashboard is left on its defaults. `vercel.json` also
serves `index.html` for deep links (SPA fallback) and sets `nosniff`, `Referrer-Policy` and
`X-Frame-Options: DENY` plus immutable caching for `/assets/*`.

> **Requirement:** Bun ≥ 1.4. The committed `bun.lock` is `lockfileVersion: 2`; older Bun
> refuses to parse it. Vercel's Bun detection uses Bun 1.2+, so the install succeeds — but if
> a deployment fails with a lockfile-parse error, raise the Bun version in the project settings
> rather than deleting the lockfile.

---

## 3. Environment variables

### 3.1 On Vercel (frontend)

| Name | Value | Scope | Public? | Why |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | The API **origin** only, e.g. `https://<worker-host>` | Production **and** Preview | **Public** — Vite inlines it into the JavaScript bundle | Tells the browser where the shared API lives |
| `VITE_VERCEL_ENV` *(optional)* | `$VERCEL_ENV` | all | Public | Only if you want to display which environment a build is |

Rules that the code enforces:

- Accepted form is a **bare origin** (`scheme://host[:port]`). A path, query, or embedded
  credentials are rejected by `src/lib/apiConfig.ts`; the app then shows an explicit
  configuration error instead of guessing.
- **Never** put a secret behind a `VITE_` name. Vite inlines every `VITE_*` value into the
  browser bundle. Gemini keys, D1/R2 tokens, Supabase service keys and Cloudflare tokens are
  **server-side Worker secrets only** and must never appear in this project's Vercel env.
- Changing it requires a **new deployment** — Vercel evaluates build-time variables per
  deployment.

If `VITE_API_BASE_URL` is missing, the app does not pretend to be connected. The shared-workspace
panel says the API is on the same origin, and the first request fails with an explicit
"built without `VITE_API_BASE_URL`" diagnostic (with the SPA fallback serving `index.html`
for `/api/*`, this is exactly what would otherwise look like an empty success).

### 3.2 On the Worker (backend) — required for the Vercel origin

| Name | Value | Public? | Why |
|---|---|---|---|
| `APP_ORIGIN` | The origin the Worker is served from | Public | Always allow-listed; also the OIDC `baseUrl` |
| `ALLOWED_ORIGINS` | Comma-separated exact origins, including the Vercel origin (production domain **and** each preview origin actually used) | Public | Credentialed CORS allow-list (`worker/src/origins.ts`) |
| `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER` | From `npx @freebuff/auth register` | Public | Sign-in |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Owner-provided | **Secret** | Server-side generation only |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Owner-provided | **Secret** | Secondary backup only |

`ALLOWED_ORIGINS` is an **exact-match** list: a wildcard is impossible by design, because
credentialed CORS requires a concrete origin. There is no CORS code to write — the Worker
already answers preflights and echoes only listed origins (`worker/src/index.ts`,
`worker/src/origins.ts`).

> Preview deployments get a new `*.vercel.app` origin per deployment. Either add each origin
> you actually test from, or assign the project a stable preview domain. A preview whose origin
> is not listed will load the app but every API call will fail CORS — by design, not silently.

---

## 4. Deploying, in order

1. **Deploy the API first** (or confirm its origin): `docs/DEPLOYMENT.md`. Note the origin
   `wrangler` prints, e.g. `https://manhwa-studio-api.<subdomain>.workers.dev`.
2. **Set `ALLOWED_ORIGINS`** on that Worker to include the Vercel origin. Redeploy the Worker so
   the variable is live.
3. **Create the Vercel project** from `Mark56-mn/Manhwa-beta`, branch = the branch you intend to
   ship (**not** `main` until the corrective work is merged).
4. **Add `VITE_API_BASE_URL`** for Production + Preview.
5. **Deploy**, then run the verification in §5.
6. **Register the Vercel origin's OIDC callback** on the same Freebuff client if you want sign-in
   there: `https://<vercel-origin>/auth/freebuff/callback` via
   `npx @freebuff/auth register … --redirect-uri <url>` (append-only). See §6 for the cookie
   caveat — registration alone does not make cross-site sessions work.

---

## 5. Verification (read-only)

```bash
node scripts/verify-deployment.mjs \
  --api https://<api-origin> \
  --origin https://<vercel-origin> \
  --frontend https://<vercel-deployment-url>
```

It performs **GET/OPTIONS only** — never a mutation — and checks:

| # | Check | Passing result |
|---|---|---|
| 1 | `GET /healthz` | 200 `{"status":"ok"}` |
| 2 | `GET /readyz` | 200 `status: ready`, per-dependency detail printed |
| 3 | `GET /api/v1/me` with `Origin` | **401**, or an honest 503 `auth_not_configured`, + `Access-Control-Allow-Origin: <exact origin>` + `Allow-Credentials: true` |
| 4 | `OPTIONS /api/v1/projects` | 204 + allowed methods + credentials |
| 5 | Preflight from an unlisted origin | no `Access-Control-Allow-Origin` (never `*`) |
| 6 | `GET /api/v1/projects` with `Origin` (TASK 06) | 401 / 503 `auth_not_configured` **and** the exact `Allow-Origin` — a `404` means the deployment is older than the projects API |
| 7 | Frontend `/` | 200 `text/html` containing `id="root"` |
| 8 | Frontend deep link | 200 `text/html` (SPA fallback, not a host 404) |
| 9 | Deployed bundle (TASK 06) | when the hosts differ, the API origin appears in the JavaScript the page loads — absent means the build ran without `VITE_API_BASE_URL` |

Exit code 0 means every check passed; 1 lists the failures; 2 means bad arguments. The script
prints the answering service and build phase, so a deployment that is older than the repository is
visible before the checks run.

### 5.1 Result of the last run against the live pair (25 October 2026)

`5/9` — exit 1. Liveness, readiness, the foreign-origin refusal and both SPA checks pass; the four
failures name the two root causes exactly:

```
[FAIL] Credentialed CORS read (/api/v1/me)                 allow-origin=absent
[FAIL] Credentialed preflight (OPTIONS /api/v1/projects)   404
[FAIL] API serves the shared routes (/api/v1/projects)     404 — redeploy the current Worker
[FAIL] Frontend build targets the API origin               absent from 1 deployed bundle
```

The frontend deployment is live and healthy; it is simply built without `VITE_API_BASE_URL`. The API
deployment is a 22 October build that predates the CORS layer and the projects API. Neither is a
code defect in this repository. See `docs/audits/TASK-06-BACKEND-READINESS-REPORT.md` §3.

Browser check still required by a human: open the deployment, confirm the shared-workspace
panel shows the expected `API:` origin, sign in, create one cloud project, reload, and confirm
it persists. That last step is the only proof that persistence works end-to-end.

---

## 6. Known limitation: cross-site sign-in cookies

The session cookie is `__Host-freebuff_session` — host-only, `SameSite=Lax`. A browser on
`*.vercel.app` therefore does **not** send it to `*.freebuff.page` (or any other registrable
domain). Consequences:

- The app loads, and unauthenticated calls (`/api/v1/me`) correctly answer `401` — the panel
  shows "Not signed in", not a fake session.
- Pressing **Sign in with Freebuff** navigates to the API origin's sign-in. The session is
  created **on the API host**, and the browser is returned to the API origin's `/`, not to the
  Vercel app.

Working topologies, in order of effort:

1. **Custom domains under one parent** (`app.example.com` on Vercel, `api.example.com` on the
   Worker): the cookie becomes same-site and cross-origin `fetch` with `credentials: 'include'`
   works.
2. **Same-origin proxy** from the hosting platform to the Worker: no CORS, cookies natural, but
   the Worker must serve the app's origin as its own.
3. **Static honesty**: ship the frontend without sign-in; the browser-local workspace and demo
   features work, and the shared panel states that a session is not available on this host.

Option 3 is what a Vercel deployment of this branch does today unless (1) or (2) is set up.

---

## 7. What is genuinely operational

| Feature | State on a Vercel deployment |
|---|---|
| Browser-local projects, Story Bible, episode scripts, approval records, analytics | **Works** — `localStorage`, single browser, no account |
| Demo AI prompt workbench | **Demo only** — labelled, never inserted into project data |
| Shared workspace: list/create cloud projects, profiles, Story Bibles, episodes, credits, generation | **Implemented and unit-tested against the real Worker**; requires `VITE_API_BASE_URL` + Worker CORS + a session. Not verified live from a Vercel origin in this task |
| Live AI generation | **Not verified** — needs `GEMINI_API_KEY` + `GEMINI_MODEL` Worker secrets; otherwise the API answers `provider_not_configured` and charges nothing |
| Sign-in | **Implemented**; subject to §6 for a cross-site host |
| Image/voice/video rendering | **Not implemented** |
| YouTube upload/publishing | **Not implemented** — the UI says so explicitly |

---

## 8. Rollback

- **Frontend:** Vercel → Deployments → previous deployment → *Promote to Production* (or
  `vercel rollback`). Static-only; no data is affected.
- **Environment variable:** revert the value and redeploy — variables are per-deployment.
- **Worker:** see `docs/DEPLOYMENT.md` §Rollback (`wrangler rollback`). A Worker rollback does
  **not** roll back an applied D1 migration.

---

## 9. Blockers recorded by this task

1. **No Vercel project could be identified or created** — this environment has no Vercel
   credentials, so which branch/commit a Vercel project deploys, and its origin(s), remain
   **unknown**. Everything that depends on the concrete Vercel origin is therefore a documented
   placeholder, never an invented value.
2. **The known live API is reachable again but is a stale build** (verified 25 Oct 2026).
   `https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page` answers `200` on `/`, `/healthz`
   and `/readyz` (`ready`), and `401` on `/api/v1/me` — but it sends **no CORS headers** and answers
   `404` for `/api/v1/projects` and `/api/v1/credits`. Its `/readyz` shape (no `origins` check) and
   `phase` string show it was deployed on 22 Oct, before `worker/src/origins.ts` and the projects API.
   The earlier `503 Site temporarily unavailable` pause is over (hosting quota state `active`).
   Connectivity is therefore **still not usable**, for a different reason: the deployment, not the
   host.
3. **No GitHub write access from this environment** (`gh auth status`: not logged in; no
   `GITHUB_TOKEN`), so the branch could not be pushed with a PR reference from here.

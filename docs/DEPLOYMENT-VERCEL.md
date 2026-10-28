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
| Database | **D1** (`DB` binding) | `db/migrations/` (`migrations_dir`) | schema committed; migrations **not applied** to any created database, but the chain is preflight-clean and applies cleanly to a disposable local D1 (TASK 10) |
| Files | **R2** (`FILES` binding) | `worker/src/assets.ts` | bound in `wrangler.toml` |
| Identity | **Supabase Auth** (bearer access tokens) | `src/lib/supabase*.ts`, `src/components/AuthPanel.tsx`, `worker/src/auth.ts` | implemented and unit-tested; **no Supabase project configured here**, so live sign-in is unverified |

The Vercel frontend is a **static** build. It has no server runtime and no credentials of its own. Every
server-backed feature is reached by the browser calling the API origin configured at build time.

**TASK 11 supersedes the TASK 10 cookie proxy.** The session is now a Supabase access token sent as
`Authorization: Bearer`, so a separately hosted API works with plain CORS: set `VITE_API_BASE_URL` to the
Worker origin and add the Vercel origin to `ALLOWED_ORIGINS`. No rewrite or proxy is needed, and
`APP_ORIGIN` stays the Worker's own origin. Background:
[`docs/audits/TASK-11-SUPABASE-AUTH-PLAN.md`](audits/TASK-11-SUPABASE-AUTH-PLAN.md) and
[`docs/audits/TASK-10-DEPLOYMENT-REVIEW.md`](audits/TASK-10-DEPLOYMENT-REVIEW.md) §3.

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
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` (bare origin, no path) | Production **and** Preview | **Public** | Supabase project for browser sign-in |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The project's publishable key | Production **and** Preview | **Public** — it is designed to be public | Client-side Supabase Auth. `VITE_SUPABASE_ANON_KEY` is accepted as a legacy alias. A service-role/secret key is **rejected** by `src/lib/supabaseConfig.ts` |
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
| `APP_ORIGIN` | The origin the Worker is served from | Public | Always allow-listed; compared by the same-origin mutation guard |
| `ALLOWED_ORIGINS` | Comma-separated exact origins, including the Vercel origin (production domain **and** each preview origin actually used) | Public | Credentialed CORS allow-list (`worker/src/origins.ts`) |
| `SUPABASE_URL` | `https://<project>.supabase.co` — **bare origin**, no path | Public | Verifies access tokens via JWKS (and is the optional backup target). A path makes it unusable |
| `SUPABASE_JWT_SECRET` | Project JWT secret — **legacy HS256 projects only** | **Secret** | HS256 verification; modern ES256 projects leave it unset |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Owner-provided | **Secret** | Server-side generation only |
| `SUPABASE_SERVICE_ROLE_KEY` | Owner-provided | **Secret** | Secondary backup only — never used for authentication |

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
6. **Configure Supabase redirect URLs** for that frontend origin (Site URL + Redirect URLs,
   including the bare origin and `/`). Confirmation and password-reset emails return there; no
   Worker-side callback or client registration is involved any more.

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
| 3 | `GET /api/v1/me` with `Origin` | **401** + `Access-Control-Allow-Origin: <exact origin>` + `Allow-Credentials: true` |
| 4 | `OPTIONS /api/v1/projects` | 204 + allowed methods + credentials |
| 5 | Preflight from an unlisted origin | no `Access-Control-Allow-Origin` (never `*`) |
| 6 | Frontend `/` | 200 `text/html` containing `id="root"` |
| 7 | Frontend deep link | 200 `text/html` (SPA fallback, not a host 404) |

Exit code 0 means every check passed; 1 lists the failures; 2 means bad arguments.

Browser check still required by a human: open the deployment, confirm the shared-workspace
panel shows the expected `API:` origin, sign in, create one cloud project, reload, and confirm
it persists. That last step is the only proof that persistence works end-to-end.

---

## 6. Cross-origin sign-in: no cookie to work around

TASK 11 replaced the `__Host-freebuff_session` cookie with a Supabase access token sent as
`Authorization: Bearer`. A `*.vercel.app` frontend can therefore sign in against a
`*.workers.dev` API with plain CORS. Requirements:

- the Vercel origin is in the Worker's `ALLOWED_ORIGINS` (exact match — no wildcard is possible);
- `Authorization` is in the preflight allow-list (`worker/src/origins.ts` — already true);
- in Supabase, Site URL + Redirect URLs include that origin, or confirmation and reset emails
  point somewhere else;
- an unconfigured or rejected Supabase build shows a configuration diagnostic: no form that
  cannot work, and never a fake session.

What this trades away: the access token is readable by page script, which is inherent to a
bearer design. Keep the publishable key public-but-publishable, never ship a service-role key,
and rely on Supabase refresh/expiry — the API verifies `exp`, `aud` and `iss` on every request.

---

## 7. What is genuinely operational

| Feature | State on a Vercel deployment |
|---|---|
| Browser-local projects, Story Bible, episode scripts, approval records, analytics | **Works** — `localStorage`, single browser, no account |
| Demo AI prompt workbench | **Demo only** — labelled, never inserted into project data |
| Shared workspace: list/create cloud projects, profiles, Story Bibles, episodes, credits, generation | **Implemented and unit-tested against the real Worker**; requires `VITE_API_BASE_URL` + Worker CORS + a session. Not verified live from a Vercel origin in this task |
| Live AI generation | **Not verified** — needs `GEMINI_API_KEY` + `GEMINI_MODEL` Worker secrets; otherwise the API answers `provider_not_configured` and charges nothing |
| Sign-in: registration, login, logout, session restore, password reset | **Implemented and unit-tested against a fake gateway**; needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` and a real Supabase project. Live sign-in is **unverified** here |
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
2. **The only known live API was unreachable during verification** (24 Oct 2026):
   `GET https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page/{healthz,readyz,api/v1/me}`
   returned `503 Site temporarily unavailable` for all paths. The Freebuff Sites record shows the
   environment still `published` and hosting usage monitoring unavailable ("Hosting usage is being
   checked. Sites will resume when monitoring is available."), i.e. a platform-side pause, not an
   application error. Connectivity and CORS against a live origin are therefore **blocked, not
   passed**.
3. **No GitHub write access from this environment** (`gh auth status`: not logged in; no
   `GITHUB_TOKEN`), so the branch could not be pushed with a PR reference from here.

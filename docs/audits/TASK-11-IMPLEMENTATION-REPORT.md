# TASK 11 — Supabase Auth implementation report

**Branch:** `task/TASK-11-SUPABASE-AUTH`
**Scope:** replace Sign in with Freebuff (OIDC) with Supabase Auth: bearer-token verification in
the Worker, browser-side registration/login/logout/session-restore/password-reset, CORS and
provisioning compatibility, tests, and documentation.
**Not performed (by instruction):** no Worker deploy, no remote migration, no production settings
or secrets changed, no merge into `main`, no Supabase project created.

---

## 1. Decisions implemented

| Question | Decision taken |
|---|---|
| Provider | Supabase Auth |
| Transport | `Authorization: Bearer <access token>` (browser-held session) |
| Freebuff | Removed, not kept alongside: `/auth/freebuff/*` answers `410 auth_moved` |
| Account linking | **None.** A Supabase `sub` (UUID) is a new tenant; existing Freebuff rows stay intact and unreachable |
| Dependencies | `jose` (Worker verification), `@supabase/supabase-js` (browser); `@freebuff/auth` removed |
| Migration | **None added.** `users.id` is `TEXT`, so a UUID subject needs no DDL |

## 2. Code changes

### Worker (backend)

| File | Change |
|---|---|
| `worker/src/auth.ts` | Rewritten: Supabase access-token verification. `SUPABASE_URL` → issuer `<url>/auth/v1`; JWKS at `<url>/auth/v1/.well-known/jwks.json` (ES256/RS256, cached per isolate); optional legacy **HS256** only when `SUPABASE_JWT_SECRET` is configured and only if the token header says HS256. `aud` must be `authenticated`; `exp`/`nbf` enforced with 5 s tolerance; `iss` accepted with or without a trailing slash; `alg: none`, HS384/HS512 and any unlisted algorithm are rejected; a missing `sub` is a rejection. `authConfigured()` now means "a usable bare `SUPABASE_URL`" |
| `worker/src/identity.ts` | `resolveFreebuffUser` → `resolveSupabaseUser`: reads exactly one `Bearer` credential from `Authorization` (strict scheme + single token, ≤8 KiB), verifies it, then shape-checks `sub` via the existing `normalizeVerifiedUser`. `X-User-Id` / `X-Organization-Id` / cookies are never consulted. Display name maps from `user_metadata.name → full_name → preferred_username` (never an identity key) |
| `worker/src/index.ts` | The `@freebuff/auth` `wrap()` layer is gone; `app.fetch` is the whole surface. `/auth/freebuff/*` → `410 auth_moved` with a pointer to browser sign-in. `/api/v1/me` verifies the bearer token. `readyz` reports Supabase configuration without leaking origins |
| `worker/src/origins.ts` | **`Authorization` added to the preflight allow-list.** Without this every cross-origin bearer request fails preflight before any route runs |
| `worker/src/env.ts` | `FREEBUFF_CLIENT_ID`/`FREEBUFF_ISSUER` removed; `SUPABASE_URL` documented as auth + optional backup; `SUPABASE_JWT_SECRET` added as secret-only |
| `worker/src/projects.ts`, `story.ts`, `assets.ts` | Default resolver swapped to `resolveSupabaseUser` (no logic change) |
| `worker/src/provisioning.ts`, `tenancy.ts` | **Unchanged.** Identifiers are SHA-256-derived from the subject; eligibility already accepts any canonical `sub` ≤255 chars, so UUIDs work as-is |

### Frontend

| File | Change |
|---|---|
| `src/lib/supabaseConfig.ts` | New: validates `VITE_SUPABASE_URL` (bare http(s) origin; https required except localhost) and `VITE_SUPABASE_PUBLISHABLE_KEY` (legacy `VITE_SUPABASE_ANON_KEY` accepted). **Rejects** any value that looks like a service-role/secret key (`sb_secret_…`, a JWT with `role: service_role`) instead of using it |
| `src/lib/supabase.ts` | New: one lazily created client (`persistSession`, `autoRefreshToken`, `detectSessionInUrl`, PKCE) and a narrow adapter onto the auth gateway seam |
| `src/lib/authGateway.ts`-equivalent (`authToken.ts`) | New: token provider — current access token per request, plus one refresh path |
| `src/lib/authSession.ts` | New: pure state machine — register (reports `confirmation_required` when Supabase returns no session), sign in, sign out, restore, reset request, password change, validation, and provider-error mapping that does not echo internals |
| `src/components/AuthPanel.tsx` | New: sign-in / register / reset tabs, session restore on load, signed-in identity + sign-out, an honest configuration diagnostic when the build has no Supabase values |
| `src/components/CloudWorkspacePanel.tsx` | Freebuff sign-in link and the `__Host-` cookie caveat removed; `AuthPanel` rendered above the workspace and reloads it on session change |
| `src/components/StoryStudio.tsx` | Expired-session branch points at the sign-in panel instead of a dead OIDC link |
| `src/lib/api.ts` | Bearer token attached per request via an `AuthTokenProvider`; exactly **one** refresh-and-retry after a 401; `credentials: 'omit'` (no ambient cookie); anonymous requests still dispatched synchronously so an abort can win. Doc comment corrected — it previously promised "no token in browser storage" |
| `package.json` / `bun.lock` | `+ jose`, `+ @supabase/supabase-js`, `− @freebuff/auth` |

### Tests

| File | What it adds |
|---|---|
| `tests/supabase-auth.test.ts` (new) | Real ES256 signatures via an in-memory JWKS: valid token, trailing-slash issuer, name fallback, expiry, wrong `aud`, foreign `iss`, missing `sub`, tampered payload, `alg: none`, HS256-when-only-a-public-key-exists, unparseable token, empty resolver. Bearer parsing (scheme, empty, multi-token, oversized). HS256 accept/reject. `/api/v1/me` end-to-end: 200 with the verified `sub`, 401 for missing/malformed/expired/wrongly-signed, 503 when `SUPABASE_URL` is absent. Preflight advertises `Authorization`; foreign origin still 403 |
| `tests/frontend-auth-session.test.ts` (new) | Registration → `confirmation_required` vs `authenticated`; validation before any call; bad-credentials / unconfirmed-email / rate-limit / network mapping; missing session is a failure; restore; sign-out; reset request; password change; unconfigured build fails honestly; config validation incl. service-role rejection and legacy-anon acceptance |
| `tests/supabase-tenancy.test.ts` (new) | UUID subject eligibility and deterministic ids; one workspace + `owner` membership; idempotent repeats; 4-way concurrent convergence to one organization; **no email/name-based linking** (two UUIDs, same display name → two workspaces; `users` has no email column); cross-tenant 404 on read/update/delete |
| `tests/auth-hardening.test.ts` | Updated: `SUPABASE_URL` configuration cases, spoofed-header suite (incl. malformed `Authorization`), retired-route 410 cases, readiness wording, and static guards now assert **only `worker/src/identity.ts` reads `Authorization`**, nothing reads cookies, `jwtVerify` appears only in `auth.ts`, and neither `auth.ts` nor `identity.ts` mentions a service-role key |
| `tests/honesty.test.ts` | Required labels moved from the Freebuff affordance to `AuthPanel` |
| `tests/api-client.test.ts` | `credentials: 'omit'` (bearer, no ambient cookie) |
| `tests/projects|asset|story-generation|task-05-story-reliability|provisioning` | `FREEBUFF_*` fixtures → `SUPABASE_URL` |

## 3. Required environment variables

| Name | Where | Type | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Vercel (build time) | Public | Project origin for the browser client |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel (build time) | Public | Publishable key (`VITE_SUPABASE_ANON_KEY` accepted as legacy alias) |
| `VITE_API_BASE_URL` | Vercel (build time) | Public | API origin (unchanged) |
| `SUPABASE_URL` | Worker `[vars]` | Public | Token verification (JWKS); bare origin only |
| `APP_ORIGIN`, `ALLOWED_ORIGINS` | Worker `[vars]` | Public | CORS + same-origin mutation guard; the Vercel origin must be listed |
| `SUPABASE_JWT_SECRET` | Worker secret | **Secret** | Legacy HS256 projects only |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker secret | **Secret** | Optional secondary backup **only**; never used for auth |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Worker secrets | **Secret** | Unchanged |

Supabase dashboard (owner): set **Site URL** and **Redirect URLs** to the frontend origin(s),
including `/`, or confirmation and password-reset links will land elsewhere. Email confirmation
is on by default — registration then returns no session until the link is opened, which the UI
states explicitly.

## 4. Verification actually run (local, this environment)

| Check | Command | Result |
|---|---|---|
| Frozen install | `bun install --frozen-lockfile` | **PASS** — 274 packages, no changes |
| Typecheck / lint | `bunx tsc --noEmit` / `bun run lint` | **PASS** (same command) |
| Tests | `bun test --isolate` | **PASS — 406 pass / 0 fail**, 1372 expectations, 27 files |
| Production build | `bun run build` | **PASS** — `dist/assets/index-*.js` 944.26 kB (gzip 263.12 kB); only the pre-existing chunk-size warning |
| Bundle scan | grep over `dist/` | **PASS** — no `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` or real `sb_secret_…` value. The only hits are the validator's own literals (`sb_secret_`, `service_role`) in `src/lib/supabaseConfig.ts` |
| Migration chain | unchanged | `db/migrations` untouched; `migrations/0002_assets.sql` preserved byte-for-byte (sha256 `e28317fa…`) and still untracked |
| Verifier script | `node --check scripts/verify-deployment.mjs` | PASS (syntax); not executed — there is no live API |

**Not run / not provable here:** live Supabase sign-up, confirmation email, refresh, password
reset, or cross-origin calls from a real Vercel origin (no Supabase project, no browser, no
deployed Worker). happy-dom/unit tests cover state logic only — **no rendering or responsive
layout is claimed verified**.

## 5. Blockers and risks

1. **No Supabase project exists for this repository.** Until the owner creates one and sets the
   four variables, sign-in cannot work end to end; the app says so rather than faking a session.
2. **Existing Freebuff users get a new, empty workspace.** Their old `users`/organization rows
   remain but are unreachable by their Supabase identity. Deliberate: no email-based linking
   (an account-takeover vector, and the schema forbids email lookups). A carry-over, if ever
   wanted, must be a reviewed one-off SQL operation.
3. **Token storage trade-off.** The access token is readable by page script. The previous
   "no token in browser storage" guarantee is retired, and the comment that promised it was
   corrected rather than left standing.
4. **Worker CORS must list the exact frontend origin**, and `Authorization` must stay in the
   allow-list (now asserted by tests and by `scripts/verify-deployment.mjs`).
5. **`SITE_URL`/redirect configuration is a production auth setting** and is left to the owner.
6. The Worker has never been deployed; `/api/v1/me` and the tenant routes remain unproven
   against a real D1 and a real Supabase token.

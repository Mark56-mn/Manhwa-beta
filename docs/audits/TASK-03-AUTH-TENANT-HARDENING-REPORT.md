# TASK 03 — Authentication & Tenant-Isolation Hardening Report

**Task:** [`tasks/TASK-03-AUTH-TENANT-HARDENING.md`](../../tasks/TASK-03-AUTH-TENANT-HARDENING.md)
**Date:** 23 October 2026
**Scope:** code + tests + docs. **Nothing deployed, merged, migrated, registered, or scheduled.**

## 1. Branch and base commit

- Branch: **`task/TASK-03-AUTH-TENANT-HARDENING`**
- Base: **`2bbd1554ae53a04f2f79bc15ad0b84e7e6d291b2`** — verified tip of
  `task/TASK-IMPLEMENT-SHARED-FOUNDATION` (local and `origin` agreed before branching).
- `origin/main` is **`49ed52c9f960b8e50ab61a21a6f2bfc7128fa5a2`**, untouched and not merged.

## 2. Exact commits

- Implementation commit: **`d990fde14ba30e2efa25a416993321e344ee3c36`**
- Report + handoff: one commit above it (branch tip = `git rev-parse HEAD`; differs only by Markdown).

## 3. Files changed and what each does

| File | Change |
|---|---|
| `worker/src/identity.ts` | Added `normalizeVerifiedUser()`: only a string `sub` (trimmed, 1–255 chars) becomes an identity; non-string names are dropped. `resolveFreebuffUser()` now routes every SDK result through it. Documented that the SDK reads only its HttpOnly cookie; no header/body identity exists. |
| `worker/src/auth.ts` | `authConfigured()` now validates configuration shape before claiming auth is available: client id must match the SDK's own `[A-Za-z0-9_-]{1,200}` rule, issuer must be an absolute http(s) URL, `APP_ORIGIN` must be a bare origin. Malformed config is an honest 503, never a 401 or a half-initialised auth instance. |
| `worker/src/origins.ts` | Exported `isValidOrigin()` / `isValidHttpUrl()`. `isAllowedMutationOrigin()` now matches the provider's documented `isSameOriginRequest` contract: a concrete Origin must be exactly allow-listed; `Origin: null`/absent is accepted **only** with `Sec-Fetch-Site: same-origin` **and** an allow-listed request origin. An unlisted Origin always wins and is rejected. |
| `worker/src/projects.ts` | PATCH now rejects `organization_id`, `created_by_sub`, `organizationId`, `createdBySub`, `user_id` with 400 instead of silently ignoring them (mass-assignment guard). Ownership remains session-derived. |
| `worker/src/index.ts` | `Vary: Origin` on every response (including refusals); unknown `/auth/freebuff/*` answers **404** when auth is configured (the SDK owns `/signin`, `/callback`, `/signout`, `/session`) and **503** `auth_not_configured` otherwise; `/readyz` reports a count-only `origins` check and no longer asserts a hardcoded R2 bucket name. |
| `src/components/CloudWorkspacePanel.tsx` | Signed-out state now offers a real “Sign in with Freebuff” link to `${api.baseUrl}/auth/freebuff/signin?returnTo=%2F`. Only rendered after the server answered 401; no simulated session. |
| `vite.config.ts` | Dev-only proxy also forwards `/auth` to the local Worker, so local sign-in matches the same-origin layout. No build effect. |
| `tests/auth-hardening.test.ts` *(new)* | 42 tests for the security cases below. |
| `tests/honesty.test.ts` | Requires the real sign-in label and `/auth/freebuff/signin` in the panel; existing no-fabrication checks retained. |
| `README.md`, `.env.example`, task/report/handoff | Counts, callback registration note, evidence, blockers. |

No dependency, lockfile, migration, or production configuration was changed.

## 4. What now works (code level)

- **One identity path.** Every protected route resolves the user from the verified SDK session; a missing/malformed/expired credential is 401, malformed configuration is 503, and no header, query or body identity is ever used.
- **Complete route inventory is gated.** `/api/v1/me`, projects (list/read/create/update/delete) and assets (list/read/HEAD/create/delete) all answer 401 with `Cache-Control: private, no-store` when signed out.
- **Tenant boundaries.** Cross-tenant project reads/updates/deletes answer 404 with rows unchanged; cross-tenant assets keep the established 403 and are unchanged; guessed ids answer 404; ownership fields cannot be patched; asset creation cannot target another tenant's project.
- **CSRF/CORS.** Credentialed CORS remains exact-origin only; preflights short-circuit before handlers; 401/403 responses to allowed origins carry CORS headers; the documented no-referrer flow (`Origin: null` + `Sec-Fetch-Site: same-origin`) works without weakening the allow-list.
- **Truthful auth surface.** No client configured → 503 `auth_not_configured`; configured but unknown path → 404; signed-out UI → explicit state plus a real sign-in link.

## 5. Provider audit (pinned `@freebuff/auth@0.1.0`)

Inspected `node_modules/@freebuff/auth/dist/index.js` and `AGENTS.md`; our code does not reimplement any of it.

| Surface | Provider behaviour (evidence) | Our integration |
|---|---|---|
| Routes | `handle()` serves `/signin` (GET), `/callback` (GET), `/signout` (POST), `/session` (GET) and returns null for anything else (dist/index.js:458–477). | `wrap()` is mounted before the inner Hono app; the inner fallback only sees unknown paths. |
| Login | Random state/nonce/verifier; PKCE `S256`; state-keyed transaction cookie; sanitized `returnTo` (318–336). | We only link to `/auth/freebuff/signin`; no hand-rolled OAuth. |
| Callback | 43-char base64url state, duplicate parameters rejected, timing-safe state/nonce checks, PKCE verifier exchange, ID-token claims `sub/exp/iat/nonce`, `azp` check, access-token `sub` must match, single-use transaction cookie cleared (359–425). | Untouched. |
| Logout | POST only; `isSameOriginRequest()` enforced; refresh token revocation attempted; session cookie cleared (434+). | No custom logout route or cookie code. |
| Session | `getUser()` outside `wrap` only verifies and never refreshes; inside `wrap` it refreshes and `wrap` appends `Set-Cookie` plus `Cache-Control: private, no-store` (280–315, 485+). | `resolveFreebuffUser()` runs inside the wrapped app path in production, so refreshes propagate. |
| Cookie | `__Host-freebuff_session` on https (host-only, `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure`); transaction cookies are per-state and short-lived (159–163). | Not modified, not read by app code, never placed in browser storage. |

**Live login/callback/logout/session remains BLOCKED** — no client is registered and no deployment is
authorised; this audit is code-level only.

## 6. Commands and exact results (final tree)

Bun **1.4.4**; frozen install; `pipefail` + explicit exit capture.

```text
bun install --frozen-lockfile   # exit 0 — 126 installs checked, no changes
bun run lint                    # exit 0 — tsc --noEmit
bun run test                    # exit 0 — 189 pass, 0 fail, 446 expect(), 12 files
bun run build                   # exit 0 — dist/ emitted; chunk-size advisory only
git diff --check                # exit 0
```

Stability: the full suite was run **8 consecutive times** with 189/189 passing each time. Baseline was
145/11; all existing tests remain, with two honesty labels added.

## 7. Tests added (44)

`tests/auth-hardening.test.ts` (42):

- **Identity:** normalization accepts a sane `sub` and drops non-string names; rejects null/empty/
  whitespace/non-string/256-char subjects.
- **Configuration:** valid public config accepted (issuer may carry `/oidc`); malformed client id,
  non-URL issuer, `APP_ORIGIN` with a path and `null` all rejected → honest 503 path.
- **Spoofing:** forged `Authorization`, `X-User-Id`, `X-Organization-Id` and session cookie return null
  with no provider, without a cookie, and with a malformed cookie.
- **Route inventory:** all 11 protected method/path combinations → 401 + `private, no-store` (HEAD body
  empty).
- **Cross-tenant:** project read/PATCH/DELETE of another tenant's id → 404 and rows unchanged; guessed
  project id → 404; ownership fields PATCH → 400 with no field change; asset read/delete cross-tenant →
  403 with D1 row and R2 object intact; unknown asset → 404; attaching an asset to another tenant's
  project → 400.
- **CSRF:** absent Origin rejected; `Origin: null` + cross-site rejected; `Origin: null` + same-origin
  accepted; absent Origin + same-origin on a second host accepted; same-origin claim on a non-allow-
  listed API host rejected; foreign Origin wins over `Sec-Fetch-Site`; full no-referrer POST creates.
- **CORS:** 401 carries exact origin/credentials/`Vary`; unlisted origin gets no CORS header but still
  `Vary`; foreign origin is 403 before session evaluation; preflight returns 204 without executing a
  handler that would have answered 503.
- **Auth surface:** 503 with no client, 404 for unknown path when configured, both `private, no-store`.
- **Readiness:** auth/origins/R2 status truthful and origin values not disclosed; invalid origins → not
  configured.
- **Static guards:** no `AUTH_USER_OVERRIDE`; no `headers.get('authorization')` / identity headers; the
  identity module does not inspect headers at all; no `set-cookie` in worker code; no `document.cookie`;
  no token/session in browser storage; no Supabase/JWT mixing in the identity module.

`tests/honesty.test.ts` (+2): the panel must contain the real “Sign in with Freebuff” label and the
`/auth/freebuff/signin` path.

## 8. Credentials/configuration still missing (names only)

- `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN` — required for sign-in; must be registered for
  each deployed origin with callback `https://<origin>/auth/freebuff/callback`.
- `ALLOWED_ORIGINS` — second frontend origin, exact.
- `VITE_API_BASE_URL` — build-time public API origin for a separately hosted frontend.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — secondary backup only; not used by this task.
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` — absent; not needed and not used.

No secret value was read, printed, committed, or requested in chat.

## 9. Production checks that remain UNVERIFIED / BLOCKED

1. **Live sign-in → callback → session cookie → `/api/v1/me` 200 → `/api/v1/projects`.** Blocked on
   OIDC client registration and an authorized deployment.
2. **Live logout and session refresh** (cookie rotation, revocation). Blocked the same way.
3. **Live two-tenant isolation against D1.** SQLite with the real migrations proves the SQL and gates;
   the live schema/data remain uninspected (no supported external D1 path, no Cloudflare token).
4. **Cookie delivery and cross-host behaviour.** The SDK's host-only `__Host-` cookie cannot cross
   `vercel.app ↔ freebuff.page`. Same-site domains or a per-host proxy are still required.
5. **`migrations/0002` is unapplied**, so the live `assets` table state is unknown and the replication
   tables do not exist.
6. **No live Supabase write / no scheduler** (out of scope and unauthorised).

## 10. Known security and deployment blockers

1. **No registered identity client** — every auth route is honestly 503 until the owner registers one.
2. **RBAC is not enforced.** Membership is required, but any member can create/update/delete projects;
   the `owner/admin/member` role column is not consulted. Tenant isolation is intact; intra-tenant
   privilege is not modelled.
3. **Multi-organization users** are served their first organization only (`firstOrganizationForUser`).
4. **Jobs, credits and backup queries** have no HTTP surface or tables in this repository, so there is
   nothing to scope; any future route must follow `worker/src/projects.ts` and derive scope from the
   session.
5. **`Origin: null` handling trusts browser-set `Sec-Fetch-Site`**, matching the provider contract. A
   non-browser spoof has no ambient session cookie; an unlisted concrete Origin is still rejected.
6. **Local http origins are allowed** so development works; production must set an https `APP_ORIGIN`.
7. **The `assets` routes return 403 for another tenant's asset** (established policy, no metadata leak)
   while projects return 404. This asymmetry is documented and tested, not accidental.
8. **Live gates cannot be replaced by local tests.** Passing tests ≠ production readiness.

## 11. Exact next task

**Owner-gated live authentication verification (roadmap TASK 03 completion), then RBAC.**

1. Owner registers the Freebuff OIDC client for the preview/production origin(s) with
   `https://<origin>/auth/freebuff/callback`, sets `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN`
   (and `ALLOWED_ORIGINS` for a second host), and authorizes a preview deployment.
2. Verify live and record: signed-out 401; sign-in; `/api/v1/me` 200; create/list as two separate
   accounts; Tenant A gets 404/403 for Tenant B's projects/assets; sign-out; cookie flags
   (`__Host-`, HttpOnly, Secure, SameSite=Lax) in a browser.
3. Only then apply `0002` (owner-authorized) and wire the backup. Do not treat this report as proof of
   any of those live checks.

Do not merge, deploy, register callbacks, apply migrations, or schedule replication without the owner's
explicit instruction.

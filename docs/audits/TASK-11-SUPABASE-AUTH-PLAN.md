# TASK 11 — Supabase Auth: implementation plan and compatibility report

**Status: PLAN ONLY. No application code, dependency, migration or production
setting was changed in this task.** Every claim below is from reading the
current tree on `task/TASK-10-DEPLOYMENT-REVIEW` @ `eade008`; nothing is
deployed, and no Supabase project was contacted (no project exists for this
repo yet, and no credentials were supplied).

The purpose of this document is to surface the compatibility problems **before**
the auth stack is rewritten, because two of them change the design rather than
just the code.

---

## 1. What was inspected

| Area | Evidence |
| --- | --- |
| Worker auth | `worker/src/auth.ts` (48 lines), `worker/src/identity.ts` (65) |
| Worker routes | `worker/src/index.ts` (194), `worker/src/projects.ts` (466), `worker/src/story.ts` (1002), `worker/src/assets.ts` (334) |
| Tenancy | `worker/src/tenancy.ts`, `worker/src/provisioning.ts`, `db/migrations/0001_init_tenancy.sql` |
| CORS / CSRF | `worker/src/origins.ts` (128) |
| Frontend client | `src/lib/api.ts` (677), `src/lib/apiConfig.ts`, `src/lib/cloudWorkspace.ts`, `src/lib/storyWorkspace.ts` |
| Frontend UI | `src/components/CloudWorkspacePanel.tsx` (327), `src/components/StoryStudio.tsx` |
| Tests touching auth | `tests/auth-hardening.test.ts` (559), `tests/tenancy.test.ts`, `tests/provisioning.test.ts`, `tests/honesty.test.ts`, `tests/asset.test.ts`, `tests/story-generation.test.ts`, `tests/task-05-story-reliability.test.ts`, `tests/projects.test.ts` |
| Config | `package.json`, `wrangler.toml`, `vercel.json`, `.env.example` |
| Local state | `node_modules` absent (deps not installed); `git status` shows only `?? migrations/` (the owner's untracked duplicate, preserved — see §8) |

### How authentication works today

1. `worker/src/auth.ts` wraps the `@freebuff/auth` SDK. `authConfigured(env)`
   requires `FREEBUFF_CLIENT_ID` (pattern `^[A-Za-z0-9_-]{1,200}$`),
   `FREEBUFF_ISSUER` (http(s) URL) and `APP_ORIGIN` (bare origin).
2. `worker/src/identity.ts` → `resolveFreebuffUser()` calls
   `setupAuth(env).getUser(request)`, which reads **only** the HttpOnly
   `__Host-freebuff_session` cookie and verifies the access token.
3. `worker/src/index.ts` `resolve()` wraps the whole Hono app in
   `setupAuth(env).wrap(...)`, which serves `/auth/freebuff/{signin,callback,signout,session}`
   and refreshes the cookie.
4. The browser never holds a token: `src/lib/api.ts` uses
   `credentials: 'include'` and no `Authorization` header; sign-in is a
   top-level navigation to `${api.baseUrl}/auth/freebuff/signin?returnTo=%2F`
   (`CloudWorkspacePanel.tsx:128`, `StoryStudio.tsx:404`).
5. Tenant resolution is `organization_memberships.user_sub` →
   `firstOrganizationForUser()`; `provisioning.ts` creates exactly one
   organization per verified `sub` using SHA-256-derived ids plus
   `ON CONFLICT DO NOTHING`.

**Supabase changes step 2–4 fundamentally:** the browser, not the Worker, owns
the session; the Worker becomes a JWT *verifier*. Steps 1 and 5 barely change.

---

## 2. Compatibility problems (ranked by impact)

### P1 — `Authorization` is missing from the CORS allow-list  *(blocks everything)*

`worker/src/origins.ts`:

```ts
const ALLOWED_REQUEST_HEADERS = ['Content-Type', 'X-Project-Id', 'X-Filename', 'X-Request-Id'].join(', ');
```

Every Supabase-authenticated request sends `Authorization: Bearer <jwt>`. A
cross-origin preflight advertising only those headers is rejected by the
browser, so `GET /api/v1/me` would fail **before the Worker ever runs** — the
symptom would look like "CORS is broken", not "auth is broken".

**Fix:** add `Authorization` to `ALLOWED_REQUEST_HEADERS`. Keep
`Access-Control-Allow-Credentials: true` (harmless, still needed if the cookie
topology is ever kept).

### P2 — Session transport: cookie vs Bearer is a product decision, not a detail

| | Today (Freebuff) | Supabase default |
| --- | --- | --- |
| Token location | HttpOnly `__Host-` cookie, unreadable by script | `localStorage` (`sb-<ref>-auth-token`), readable by script |
| API credential | ambient cookie, `credentials: 'include'` | explicit `Authorization` header |
| CSRF exposure | mitigated by `SameSite=Lax` + `isAllowedMutationOrigin` | no ambient credential, so no classic CSRF — but XSS now steals a refresh token |
| Cross-host | requires proxy or shared parent domain (`__Host-` is host-only) | works from any origin Supabase allows |

`src/lib/api.ts` documents the current posture as *"There is no token in browser
storage"*. Supabase's default **breaks that guarantee**, so the claim must be
retired rather than quietly falsified — `tests/honesty.test.ts` already asserts
product-honesty properties and will need updating with the same commit.

Two viable designs:

- **A. Bearer tokens (recommended for this task).** Add `Authorization` to
  requests; keep `isAllowedMutationOrigin` as defence in depth. Cost: tokens in
  `localStorage` (Supabase's supported model). Benefit: no new Worker session
  store, no proxy requirement, and the `__Host-` cookie/CORS-host constraints
  that dominated TASK 10 disappear entirely.
- **B. Worker-held HttpOnly session (stronger, more work).** Exchange the
  Supabase JWT at a Worker endpoint for a signed, HttpOnly cookie; keep P2's
  current posture. Requires a new cookie-signing secret, a refresh path through
  the Worker, and the same-origin proxy to stay in place.

Recommendation: **A now**, and record B as an explicit later hardening task with
its own threat model. Do not silently mix the two.

### P3 — No JWT verification primitive exists in the tree

`package.json` has no `jose` (confirmed: `node_modules/jose` absent) and no
`@supabase/*`. Supabase Auth issues tokens in one of two modes:

- **Asymmetric (default for current projects): `ES256`**, public keys at
  `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` — verifiable with no secret
  in the Worker at all.
- **Legacy symmetric: `HS256`**, verified with the project JWT secret.

**Fix:** add `jose` (Workers-native, WebCrypto-backed) and verify against the
JWKS set, restricting `algorithms` to `['ES256','RS256']`. Never accept `none`,
never accept an algorithm taken from the token header, and never use the
`service_role` key to verify anything. `HS256` support should be opt-in via
`SUPABASE_JWT_SECRET` and off otherwise.

Detail worth getting right: jose compares `iss` exactly, while Supabase tokens
have historically appeared both with and without a trailing slash
(`…/auth/v1` vs `…/auth/v1/`). The verifier must normalise, and the tests must
cover **both** spellings.

### P4 — `authConfigured()` and its `wrap()` are Freebuff-shaped

`authConfigured(env)` is imported by `projects.ts`, `story.ts`, `assets.ts` and
`index.ts`; `setupAuth(env).wrap()` and `.getUser()` are used in `index.ts:161`
and `:174-178`. The `503 auth_not_configured` contract (with the honest
"owner must register a client" message) is valuable and should be **kept**, but
its source becomes `SUPABASE_URL`.

`/auth/freebuff/*` cannot survive unchanged: with the SDK wrap removed, the
fallback route currently answers 503/404. It should answer **410 Gone** with a
pointer to the new sign-in path, so an old bookmark fails loudly and
accurately instead of looking like an outage.

### P5 — Identity claim mapping: `name` does not exist in a Supabase token

`identity.ts` `normalizeVerifiedUser()` reads `sub` and `name`. A Supabase
access token carries `sub`, `email`, `role`, `aud`, `iss`, `exp` and
`user_metadata` — the display name lives at `user_metadata.name` /
`user_metadata.full_name`, not top level. Without a mapping,
`provisioning.ts` names every workspace `Personal workspace` and leaves
`users.display_name` null.

**Fix:** map `sub` (required), then
`user_metadata.name ?? user_metadata.full_name ?? email` (display only), keeping
`normalizeVerifiedUser`'s existing length/emptiness guards. `sub` remains the
only identity that touches tenant lookups.

### P6 — Existing Freebuff users cannot be linked without weakening isolation

`users.id` is the OIDC `sub`, and `db/migrations/0001_init_tenancy.sql` states
explicitly: *"No emails are stored here; lookups are never done by email."*
A Supabase account has a **different** `sub` (a UUID), so
`organizationIdForSubject()` derives a **different** org id.

- Linking the two accounts by verified email would require an email-keyed
  lookup — exactly the property the schema forbids, and a takeover vector if
  either provider's verification is ever misconfigured.
- **Recommendation: no linking.** Supabase users start with a fresh workspace;
  any Freebuff-created rows remain intact but unreachable by the new identity.
  If the owner has real data to carry over, that is a one-off, reviewed
  `UPDATE users SET id = …`/`INSERT` migration performed by the owner — not
  something this codebase should do automatically.

### P7 — Email confirmation and password-reset redirects are dashboard settings

Supabase enables **email confirmation** by default: `signUp()` returns a user
with no session, and login fails until the address is confirmed. Deployed
without thought, the UI reads as "registration silently does nothing".
Password recovery also requires the destination URL to be allow-listed
(Site URL + redirect allow-list). Both are **production auth settings**, so they
are owner actions, listed in §9 and deliberately *not* touched here.

Frontend implication: recovery links land on the **frontend origin** with PKCE
`?code=`, so the Supabase client needs `detectSessionInUrl: true` and
`exchangeCodeForSession` on load. This is the one place a Supabase app still
needs the SPA catch-all rewrite that `vercel.json` already has.

### P8 — Test fixtures encode Freebuff as "auth configured"

Six test files set `FREEBUFF_CLIENT_ID`/`FREEBUFF_ISSUER` as the signal that
auth is on, and `tests/auth-hardening.test.ts` imports `resolveFreebuffUser`
and `authConfigured` directly (lines 7-8, 125-138, 155-171). `tests/honesty.test.ts:106`
asserts the `/auth/freebuff/signin` affordance exists in
`CloudWorkspacePanel.tsx`.

These are **updates, not deletions** — in particular the existing
`Authorization: Bearer forged-…` case (`auth-hardening.test.ts:146`) currently
passes *because* the identity layer ignores that header; after the change it
becomes a genuine forged-token test and must still resolve to `null`.

---

## 3. Target design (recommended: P2 option A)

```
Browser (Vercel)
  ├─ @supabase/supabase-js ──► https://<ref>.supabase.co  (signup/login/reset/refresh)
  │      keeps session in localStorage, refreshes the access token
  └─ fetch(`${VITE_API_BASE_URL}/api/v1/...`)
         Authorization: Bearer <access_token>
              │
              ▼
Cloudflare Worker
  ├─ verifySupabaseToken(): jose + JWKS(ES256), iss, aud=authenticated, exp
  ├─ normalizeVerifiedUser(): sub + display name
  ├─ resolveOrganizationForUser(): unchanged    (provisioning.ts)
  └─ D1/R2: unchanged, still scoped by organization_id
```

No Worker session store, no OAuth client registration, no `__Host-` cookie, no
`/auth/*` proxy. The Worker's only new configuration is the public
`SUPABASE_URL`.

---

## 4. Implementation plan (file by file)

### Backend

| File | Change |
| --- | --- |
| `worker/src/env.ts` | Add `SUPABASE_URL?` (public), `SUPABASE_JWT_SECRET?` (legacy HS256 only). Leave `SUPABASE_SERVICE_ROLE_KEY` untouched and server-only. |
| `worker/src/auth.ts` | Replace the SDK wrapper with `authConfigured()` (valid bare https origin) + `verifySupabaseToken()` using `jose`: `createRemoteJWKSet` cached per isolate, `jwtVerify` with `algorithms: ['ES256','RS256']`, `audience: 'authenticated'`, normalised `issuer`. Optional HS256 path only when `SUPABASE_JWT_SECRET` is set. |
| `worker/src/identity.ts` | `resolveSupabaseUser(request)`: read exactly one `Authorization: Bearer <token>` header, verify, map claims, return `null` on any failure. Keep `AuthenticatedUser`, `UserResolver`, `normalizeVerifiedUser`. Ignore `X-User-Id`, query and body entirely. |
| `worker/src/index.ts` | Drop `wrap()`/`setupAuth`; `/api/v1/me` uses the resolver; `/auth/freebuff/*` → `410` with a migration pointer; `/readyz` auth detail names Supabase; root route list updated. |
| `worker/src/origins.ts` | **P1:** add `Authorization` to `ALLOWED_REQUEST_HEADERS`. |
| `worker/src/projects.ts`, `story.ts`, `assets.ts` | Mechanical: default `resolveUser` → `resolveSupabaseUser`; imports. No route logic changes. |
| `worker/src/provisioning.ts`, `tenancy.ts` | **Unchanged.** UUID subjects satisfy `isEligibleForProvisioning` (non-empty, trimmed, ≤255) and the deterministic hashing already works for any string. |

Verification sketch (for review, not yet committed):

```ts
// worker/src/auth.ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

let cached: { key: string; jwks: ReturnType<typeof createRemoteJWKSet> } | undefined;

export function authConfigured(env: Env): boolean {
  return Boolean(env.SUPABASE_URL && isValidOrigin(env.SUPABASE_URL));
}

export async function verifySupabaseToken(env: Env, token: string): Promise<JWTPayload | null> {
  if (!authConfigured(env)) return null;
  const base = env.SUPABASE_URL!.replace(/\/+$/, '');
  const key = `${base}|${env.SUPABASE_JWT_SECRET ? 'hs256' : 'jwks'}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      jwks: createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`), { timeoutDuration: 5000 })
    };
  }
  try {
    const { payload } = await jwtVerify(token, /* HS256: secret; else cached.jwks */ cached.jwks, {
      issuer: `${base}/auth/v1`,          // normalise trailing slash, test both
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
      clockTolerance: 5
    });
    return payload;
  } catch {
    return null;                          // never leak verification detail
  }
}
```

### Frontend

| File | Change |
| --- | --- |
| `package.json` | Add `@supabase/supabase-js` (and `jose` on the Worker side). `bun.lock` updates — expected, commit it. |
| `src/lib/supabaseConfig.ts` (new) | Read `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (fallback `VITE_SUPABASE_ANON_KEY`). Validate the URL as a bare https origin; **refuse** a key that looks like a secret (`sb_secret_…`, or a JWT whose `role` claim is `service_role`) with a clear diagnostic. |
| `src/lib/supabase.ts` (new) | `createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })`; `not_configured` state when config is missing. |
| `src/lib/authSession.ts` (new) | Pure state machine: `signUp`, `signInWithPassword`, `signOut`, `requestPasswordReset`, `restoreSession`, `getAccessToken`, `refreshSession`. Every outcome typed and honest (`invalid_credentials`, `email_unconfirmed`, `rate_limited`, `not_configured`, `network`). Unit-testable without a browser. |
| `src/lib/api.ts` | Accept an injectable `getAccessToken`; attach `Authorization: Bearer` when a token exists; on `401`, refresh **once** and retry, then surface `unauthorized`. Keep `credentials: 'include'` for the Worker-hosted build. Retire the "no token in browser storage" comment (P2). |
| `src/components/AuthPanel.tsx` (new) | Email/password register + login, "check your email" state, forgot-password, sign-out. Replaces the sign-in links at `CloudWorkspacePanel.tsx:128` and `StoryStudio.tsx:404`. |
| `src/lib/cloudWorkspace.ts` | `unauthorized` → `signed_out` stays; add a branch that names the Supabase state (not configured / unconfirmed / signed out). |
| `.env.example`, `README.md`, `docs/DEPLOYMENT*.md` | Document the two public variables, the Worker's `SUPABASE_URL`, and the dashboard settings. |

### Never in the browser

`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `sb_secret_…`,
`CLOUDFLARE_API_TOKEN`, `GEMINI_API_KEY`. The publishable/anon key is public by
design; no `VITE_` variable may carry anything else.

---

## 5. Environment contract

| Variable | Where | Public? | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel (build) | public | Supabase project URL for the browser client |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel (build) | public | Supabase publishable key (`sb_publishable_…`); legacy `VITE_SUPABASE_ANON_KEY` accepted as a fallback |
| `VITE_API_BASE_URL` | Vercel (build) | public | Existing API origin; unset means same-origin proxy (still the cheapest topology) |
| `SUPABASE_URL` | Worker `[vars]` | public | JWKS/issuer base for token verification |
| `SUPABASE_JWT_SECRET` | Worker secret | **secret** | Only for legacy HS256 projects; omit for ES256 |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker secret | **secret** | Unchanged, secondary backup use only — never for auth |

---

## 6. Database impact

**No migration is required and none is proposed.**

- `users.id TEXT` already accepts a UUID `sub`; `organization_memberships.user_sub`
  and `projects.created_by_sub` reference it unchanged.
- `provisioning.ts` keys are derived hashes, so they work for any subject string.
- The untracked `migrations/0002_assets.sql` is **not touched** (sha256
  `e28317fa1ccc30d885151aa26e8f445652043e5558c6720927f805e52f27ea59`, 1014 bytes),
  and `wrangler.toml` keeps `migrations_dir = "db/migrations"` from TASK 10.
- Consequence to accept consciously (P6): existing Freebuff-created
  organizations become unreachable from Supabase identities.

---

## 7. Test plan

| Suite | Cases |
| --- | --- |
| `tests/supabase-auth.test.ts` (new) | locally generated ES256 keypair + injected JWKS fetch: valid → user; expired → null; wrong `aud` → null; `iss` with and without trailing slash; tampered signature → null; `alg: none` → null; HS256 token while ES256-only → null; missing/malformed `Authorization` → null; `X-User-Id`/query spoof ignored; configured+invalid → **401**; unconfigured → **503 auth_not_configured** |
| `tests/tenancy-supabase.test.ts` (new) | UUID `sub` provisioning creates exactly one org; concurrent first requests converge (one `organization.provisioned` audit row); second tenant's project id → 404; membership required; role stays `owner` |
| `tests/auth-hardening.test.ts` | update imports/env fixtures; keep the forged-Bearer case (now meaningful); keep 503/401 contract assertions |
| `tests/honesty.test.ts` | update the sign-in-affordance assertion to the new panel; keep "no fake URLs" checks |
| `tests/auth-panel.test.tsx` (new, happy-dom) | register/login/logout/reset state rendering; error states; `not_configured` diagnostic. **happy-dom is not a browser** — no claim about real rendering is made |

Existing suites must stay green: 349 tests / 1185 assertions / 24 files at
`eade008`.

---

## 8. Verification commands (NOT EXECUTED — `node_modules` is absent)

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile        # will FAIL until package.json/lock change is committed
bunx tsc --noEmit
bun run lint
bun run test
bun run build
bun run migrations:check
grep -rIl -E 'service_role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY' dist/ || echo "no secret markers in bundle"
bunx wrangler deploy --dry-run --outdir=/tmp/dryrun
```

Bundle scan is mandatory: it is the only mechanical proof that no secret reached
the browser.

---

## 9. Owner actions required (production settings — out of scope here)

1. Create the Supabase project and record the URL + publishable key.
2. Authentication → URL Configuration: Site URL `https://manhwa-beta.vercel.app`
   and redirect allow-list including `https://manhwa-beta.vercel.app/**`.
3. Decide email confirmation on/off (affects whether sign-up returns a session).
4. Password-reset email template + SMTP, if the defaults are insufficient.
5. Set the Vercel variables in §5 (Production **and** Preview).
6. Set the Worker `SUPABASE_URL` var.
7. Remove or keep `FREEBUFF_CLIENT_ID`/`FREEBUFF_ISSUER`; if Freebuff is retired,
   unset them so `/readyz` does not report two identity providers.

---

## 10. Decisions required before implementation

1. **Transport:** Bearer + `localStorage` (recommended, P2-A) or Worker-held
   HttpOnly cookie (P2-B)?
2. **Freebuff:** remove the SDK and dependency in the same commit (recommended),
   or keep both providers temporarily?
3. **Existing users (P6):** accept fresh workspaces, or have the owner perform a
   reviewed one-off id remap?
4. **Dependencies:** approve `jose` (Worker) + `@supabase/supabase-js` (browser).
5. **Scope:** implement now, or after the owner confirms 1–4?

---

## 11. Blockers and limitations

- **No Supabase project or keys exist for this repo**, so no live sign-up,
  login, refresh, reset or confirmation flow can be executed — everything above
  is unit-level until the owner supplies configuration.
- **No browser is available in this environment**, so the auth UI cannot be
  clicked through; happy-dom proves state logic only.
- **Dependencies are not installed**, so no check above has been run for this
  plan. TASK 10's green gates (`eade008`) describe the tree as it stands.
- Dashboard-side settings in §9 cannot be performed from this workspace.

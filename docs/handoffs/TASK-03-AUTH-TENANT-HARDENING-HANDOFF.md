# TASK 03 — Authentication & Tenant-Isolation Handoff

**From:** hardening agent · **To:** next agent / repository owner
**Date:** 23 October 2026
**Branch:** `task/TASK-03-AUTH-TENANT-HARDENING`
**Base:** `2bbd1554ae53a04f2f79bc15ad0b84e7e6d291b2`
**Report:** [`docs/audits/TASK-03-AUTH-TENANT-HARDENING-REPORT.md`](../audits/TASK-03-AUTH-TENANT-HARDENING-REPORT.md)
**Task:** [`tasks/TASK-03-AUTH-TENANT-HARDENING.md`](../../tasks/TASK-03-AUTH-TENANT-HARDENING.md)

> **Nothing was deployed, merged, migrated, or registered.** `origin/main` remains `49ed52c`.
> Live sign-in/callback/logout and live D1 isolation are **BLOCKED/UNVERIFIED**, not passed.

## 1. What is done

- `normalizeVerifiedUser()` is the final shape check on the SDK's verified claims (`sub` 1–255 chars;
  no browser-supplied identity anywhere).
- `authConfigured()` validates client-id shape, issuer URL and `APP_ORIGIN` origin form, so malformed
  configuration is an honest 503 instead of a misleading 401.
- The CSRF guard now matches the provider's documented contract: exact allow-listed Origin, or
  `Origin: null`/absent with browser-set `Sec-Fetch-Site: same-origin` **and** an allow-listed API origin.
- PATCH ownership/mass-assignment fields are rejected with 400.
- Unknown `/auth/freebuff/*` paths are 404 when configured and 503 when not; readiness reports a
  count-only origins check and no longer hardcodes an R2 bucket name.
- The signed-out panel offers a real “Sign in with Freebuff” link; no simulated session was added.
- 44 new tests (42 security tests + 2 honesty labels) cover identity, spoofing, every protected route,
  cross-tenant project/asset operations, ID guessing, ownership fields, CSRF, preflight, CORS on 401,
  auth fallback, readiness and static regression guards.

## 2. Security invariants (do not undo)

1. **Identity is only the SDK-verified session.** `worker/src/identity.ts` must not inspect headers.
2. **Tenant scope comes from `firstOrganizationForUser()`**, never from a request field. Every SQL
   statement must include `organization_id` from the session.
3. **Mutations require an allow-listed Origin** (or the provider-sanctioned no-referrer path). No
   “missing Origin = allow”.
4. **CORS is exact, credentialed, and never wildcard.** `Vary: Origin` belongs on every response.
5. **No cookies, tokens or sessions in application code or browser storage.** The SDK owns the
   HttpOnly cookie; app code never sets or reads it.
6. **No second identity provider.** Supabase is backup only; do not add a Supabase JWT path without an
   explicit adapter task and owner decision.
7. **Tests inject `resolveUser`** through `createProjectsApp`/`createAssetApp`; keep it that way and
   never reintroduce an environment flag that mints a user.

## 3. Files that matter

| Path | Why |
|---|---|
| `worker/src/identity.ts` | The only identity derivation; `normalizeVerifiedUser` lives here. |
| `worker/src/auth.ts` | Configuration validity and the single SDK instance. |
| `worker/src/origins.ts` | Origin validation, CORS headers, mutation/CSRF guard. |
| `worker/src/projects.ts` | Reference tenant-scoped resource; ownership-field guard. |
| `worker/src/assets.ts` | Tenant-scoped R2 routes; 403 policy for other tenants. |
| `worker/src/index.ts` | CORS middleware, auth fallback, `/readyz`, worker entry. |
| `tests/auth-hardening.test.ts` | The security regression suite; extend it for new routes. |
| `tests/helpers/d1.ts` / `r2.ts` | Real-SQLite D1 and in-memory R2 doubles. |
| `src/components/CloudWorkspacePanel.tsx` | Honest signed-out/ready states and sign-in link. |

## 4. Test/gate results on this branch

```text
bun install --frozen-lockfile   # 0
bun run lint                    # 0
bun run test                    # 0 — 189 pass, 0 fail, 446 expect(), 12 files
bun run build                   # 0
git diff --check                # 0
```

The full suite was run 8 consecutive times with 189/189 each time. Baseline was 145/11.

## 5. Provider audit summary (pinned `@freebuff/auth@0.1.0`)

`dist/index.js` implements: PKCE S256 with random state/nonce/verifier; a per-state transaction cookie;
43-char state regex; timing-safe state and nonce comparisons; ID-token `sub/exp/iat/nonce` with `azp`;
access-token `sub` equality; single-use transaction cookie; POST-only signout with a same-origin check;
HttpOnly `SameSite=Lax` `Secure` `__Host-` session cookie; refresh only inside `wrap`, which appends
cookies and sets `Cache-Control: private, no-store`. We do not reimplement any of it. Full citations are
in the report §5.

## 6. Remaining live verification — exact checklist (owner-gated)

Prerequisites (public values only; never paste secrets into chat):

1. `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN` for the preview/deployed origin.
   Register each origin with callback `https://<origin>/auth/freebuff/callback`
   (SDK: `npx @freebuff/auth register --project <slug> --name "<name>" --environment production
   --redirect-uri https://<origin>/auth/freebuff/callback`). The owner runs this with their own login.
2. `ALLOWED_ORIGINS` for any second frontend origin (exact; never `*`).
3. Authorized preview deployment (not performed here).

Then record each result:

- [ ] Signed out: `/api/v1/me`, projects and assets return 401; unknown auth path returns 404 or 503
      according to configuration.
- [ ] Sign-in link → Freebuff consent → callback returns to `/`; browser shows the `__Host-` session
      cookie with HttpOnly, Secure, SameSite=Lax.
- [ ] `/api/v1/me` returns the same `sub` shown by `/auth/freebuff/session`.
- [ ] Create/list a project as account A; repeat as account B on a second browser profile.
- [ ] A requesting B's project id gets 404 and no change; B's asset gets 403 and no change.
- [ ] Sign-out (POST) clears the cookie and `/api/v1/me` returns 401.
- [ ] Expired/invalid session returns 401 (no 500, no anonymous fallback).

**Do not mark TASK 03 live-complete until these are observed on a deployed origin.**

## 7. Known limits / blockers

- Live auth and D1 are unverified (no client, no deployment, no Cloudflare token).
- `migrations/0002` is still unapplied; the live `assets` table state is unknown.
- Intra-tenant roles are not enforced (any member can mutate); multi-org users see only their first org.
- No jobs/credits tables or routes exist; there is no scope to test there yet.
- Cross-site cookies cannot cross unrelated domains; dual-host still needs same-site domains or a proxy.
- Assets return 403 for another tenant while projects return 404 (documented, intentional).
- `APP_ORIGIN` may be http only for local development; production must be https.

## 8. Commands for the next agent

```bash
git switch task/TASK-03-AUTH-TENANT-HARDENING
bun install --frozen-lockfile
bun run lint && bun run test && bun run build && git diff --check

# Local UI/API (no auth client configured -> honest "not configured"):
bunx wrangler dev --port 8787
bun run dev
```

Never enable GitHub Actions; never commit a secret; never apply a migration, deploy, register a callback
or schedule replication without explicit owner instruction.

# TASK 03 — Harden authentication and tenant isolation

**Product:** Manhwa Studio (Manhwa Beta) · **Repo:** `Mark56-mn/Manhwa-beta`
**Branch:** `task/TASK-03-AUTH-TENANT-HARDENING`
**Base:** `2bbd1554ae53a04f2f79bc15ad0b84e7e6d291b2` (`task/TASK-IMPLEMENT-SHARED-FOUNDATION` tip)
**Date:** 23 October 2026
**Report:** [`docs/audits/TASK-03-AUTH-TENANT-HARDENING-REPORT.md`](../docs/audits/TASK-03-AUTH-TENANT-HARDENING-REPORT.md)
**Handoff:** [`docs/handoffs/TASK-03-AUTH-TENANT-HARDENING-HANDOFF.md`](../docs/handoffs/TASK-03-AUTH-TENANT-HARDENING-HANDOFF.md)

## Objective

Make the authentication and tenant-isolation boundary ready for real preview verification:
close the code-level gaps, prove the security cases against the real router and D1-compatible
schema, and write an exact owner checklist for everything that needs credentials or deployment.

## Verified starting state

- Branch tip and remote agree: `2bbd155`. `origin/main` is `49ed52c` (not merged).
- Existing identity path: `worker/src/identity.ts` → `@freebuff/auth` `getUser`.
- Existing protected routes: `/api/v1/me`, `/api/v1/projects` (GET/POST/PATCH/DELETE),
  `/api/v1/assets` (GET/PUT/DELETE, HEAD by id).
- Existing gates: 145 tests / 11 files, lint and build green.
- No OIDC client, deployment, or Supabase project exists in this environment.

## Work in this task

1. **Identity contract**
   - Normalize and strictly validate a verified `sub` (string, non-empty, ≤255 chars, no browser input).
   - Validate required configuration shape before reporting auth as configured (so malformed config is
     an honest 503, never a 401 or an accidental anonymous request).
   - Prove that spoofed `Authorization`, `X-User-Id`, `X-Organization-Id` and malformed session cookies
     never produce a user.
2. **Route audit** — every protected method answers 401 with `private, no-store` when signed out; no
   route reads an identity from headers, query or body.
3. **Tenant isolation** — cross-tenant project/asset reads, updates, deletes and ID guessing answer
   non-disclosing 404 (assets keep the established 403); ownership fields in a PATCH are rejected.
4. **CSRF / CORS** — align the mutation guard with the provider's documented contract (`Origin: null`
   plus `Sec-Fetch-Site: same-origin` from no-referrer pages), while keeping the exact allow-list and
   credentialed CORS; verify preflights never execute handlers and error responses still carry CORS
   headers for allowed origins.
5. **Auth route honesty** — an unknown `/auth/freebuff/*` path answers 404 when auth is configured
   (the SDK owns `/signin`, `/callback`, `/signout`, `/session`) and 503 `auth_not_configured` otherwise.
6. **UI** — a real “Sign in with Freebuff” link in the signed-out state; never a simulated session.
7. **Provider audit** — record what the pinned SDK actually implements for login/callback/logout/session
   (PKCE, state, nonce, cookie flags, refresh) and which parts remain unverified without registration.

## Out of scope / prohibited without owner authorization

- Deploying, merging, registering OIDC callbacks, applying migrations, enabling GitHub Actions.
- Scheduling replication or adding background production writes.
- Adding Supabase Auth code or mixing identity providers; no browser-stored bearer tokens.
- Changing the SDK's cookie settings; no weakening of `HttpOnly`/`SameSite`/`Secure`.

## Verification

`bun install --frozen-lockfile`, `bun run lint`, `bun run test`, `bun run build`, `git diff --check` on
the final tree, plus deterministic tests for every security case above. Live sign-in, cookie delivery
and live D1 isolation remain **BLOCKED/UNVERIFIED** until the owner registers a client and authorizes a
preview deployment.

## Done criteria

- Authentication and tenant-isolation tests pass against the real Worker routes and SQLite/D1 schema.
- The UI still never fabricates a session or a server save.
- Remaining live gaps and exact environment variable names are documented as unverified.
- Report and handoff written; branch pushed; nothing merged or deployed.

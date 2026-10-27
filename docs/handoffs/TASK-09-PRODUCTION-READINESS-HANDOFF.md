# TASK 09 — Handoff

**Status:** preparation complete. **Nothing was deployed, migrated remotely, registered, published or
merged**, and no production setting, secret or variable was changed.

- **Branch:** `task/TASK-09-PRODUCTION-READINESS`
- **Base:** `3420e2b` (`task/TASK-08-BACKEND-RECOVERY` → `604ffa8` → `main` `d0eba90`)
- **Previous `main` observed:** `d0eba90` — unchanged by this task; no PR was merged and no force-push occurred.
- **Full evidence:** [`docs/audits/TASK-09-PRODUCTION-READINESS-REPORT.md`](../audits/TASK-09-PRODUCTION-READINESS-REPORT.md)
- **Next task:** [`tasks/TASK-10-DEPLOY-WORKER-AND-CONNECT-FRONTEND.md`](../../tasks/TASK-10-DEPLOY-WORKER-AND-CONNECT-FRONTEND.md)

---

## 1. What is done (verified)

1. **Organization provisioning exists and is tested** (`worker/src/provisioning.ts`). First authenticated
   request → exactly one organization + one `owner` membership, derived from the verified OIDC `sub`.
   Idempotent, race-safe by deterministic keys + `ON CONFLICT DO NOTHING` (no transactions needed), an
   existing membership always wins, one audit event per created organization. Wired into all 7 protected
   route call sites (`projects`, `story`, `assets`).
2. **Migration safety is understood and guarded.** The tracked chain applies cleanly onto a database that
   already has `assets` (proven on a disposable local D1 with `wrangler`); the untracked duplicate fails
   with `table assets already exists at offset 268` and aborts the apply. `bun run migrations:check`
   (new, `scripts/check-migrations.mjs`) now refuses such a chain *before* D1 is touched.
3. **Deployment config re-verified**: `wrangler.toml` still matches the real D1 `d9557398-…`
   (WNAM, 7 tables, 111 kB), R2 `manhwa-studio-assets`, and account `78bd087d…`. The Worker bundles at
   **196.18 KiB / gzip 45.04 KiB** with both bindings resolved. The account still has **0 Worker scripts**
   and **no `workers.dev` subdomain**.
4. **Auth topology is decided on evidence.** The SDK sets `__Host-<name>; Secure; HttpOnly; Path=/;
   SameSite=Lax` with **no `Domain=`** → host-only. Recommended: proxy `/api/*` and `/auth/*` under the
   frontend origin (exact `vercel.json` snippet in report §4.2), which keeps `VITE_API_BASE_URL` empty.
5. **All local gates green:** 349 tests / 24 files / 1185 assertions (exit 0), `tsc` 0, `lint` 0,
   `build` 0, dry-run 0. The migration preflight exits 1 **by design** until the stray file is moved.

## 2. Files changed

| File | Change |
|---|---|
| `worker/src/provisioning.ts` | **new** — eligibility policy, deterministic ids, `ensureOrganizationForUser`, `resolveOrganizationForUser` |
| `worker/src/projects.ts`, `worker/src/story.ts` | import + one call site each now provision on first use |
| `worker/src/assets.ts` | import + 5 call sites now provision on first use |
| `tests/provisioning.test.ts` | **new** — 21 cases (provisioning, concurrency, isolation, route wiring) |
| `tests/migration-safety.test.ts` | **new** — 11 cases (disposable DB, drift tolerance, preflight verdicts) |
| `tests/projects.test.ts` | one test rewritten for the new 403 contract (ineligible subject, no tenant created) |
| `scripts/check-migrations.mjs` | **new** — static migration-chain preflight (blockers/warnings) |
| `package.json` | adds `migrations:check` |
| `wrangler.toml` | commented `[vars]`/secret/hostname documentation only — **no binding change** |
| `README.md`, `docs/DEPLOYMENT.md` | test counts, preflight step, provisioning section, corrected claims |

No application UI was changed. No dependency was added or upgraded; `bun.lock` is untouched.

## 3. Binding decisions a successor must not silently reverse

1. **`sub` is the only identity.** Nothing client-supplied may select a tenant. Provisioning runs only
   after session verification.
2. **Deterministic ids + `ON CONFLICT DO NOTHING` are the concurrency control.** Do not add a
   read-then-write "check for duplicates" without keeping the derived keys — the guarantee lives in the
   primary keys, not in the check.
3. **An existing membership always wins.** Never auto-create a second organization for a user.
4. **Role is `owner`** for a provisioned workspace; never take a role from a request.
5. **Migrations stay additive.** No `DROP`/`ALTER`/`DELETE`; the preflight enforces it.
6. **Keep the untracked file until the owner moves it.** It was deliberately left in the working tree;
   deleting user work is out of bounds for an agent.

## 4. Blocked on the owner (in this order)

1. ~~Move the untracked duplicate~~ — **resolved in TASK 10 by configuration** (`migrations_dir =
   "db/migrations"`). `bun run migrations:check` now exits 0 and the untracked file stays exactly where it
   is. Do not point `migrations_dir` back at `migrations/`.
2. Create the `workers.dev` subdomain **or** choose the custom domain (`oppa-technologies.online` zone is
   active, id `27fc0052c37507c9ef98f9ff1d306a3f`).
3. Authorize `bunx wrangler deploy` and, after the restore bookmark,
   `bunx wrangler d1 migrations apply manhwa-studio --remote`.
4. Register the OIDC client for the final origin (owner's Freebuff login;
   `npx @freebuff/auth register --redirect-uri https://<origin>/auth/freebuff/callback`).
5. Set `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN`, `ALLOWED_ORIGINS` as `[vars]`.
6. Frontend: add the same-origin proxy rewrites and redeploy (Vercel settings are not reachable from this
   workspace — no credentials).

## 5. Not verified — do not claim otherwise

No live Worker, no live D1/R2 access from a deployment, no real sign-in or session, no provisioning event
in production, no live AI generation, no browser/visual/responsive check, and no D1-engine verification of
provisioning (SQLite only). `/readyz`'s `d1: ok` is a `SELECT 1`, not proof of schema.

## 6. Reproduce the checks

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile
bunx tsc --noEmit
bun run lint
bun run test          # 349 pass / 0 fail / 24 files / 1185 assertions
bun run build
bun run migrations:check   # exit 1 is expected while the stray file exists

# Worker integration, config exactly as committed:
bunx wrangler dev --local --port 8787 --persist-to /tmp/dev
curl -si http://127.0.0.1:8787/healthz
curl -si http://127.0.0.1:8787/readyz
```

## 7. Warning to the next agent

The most likely way to "break" this deployment while every check passes is a **cookie topology mistake**:
setting `VITE_API_BASE_URL` to a different site and expecting sign-in to work. It cannot — the session
cookie is `__Host-` (host-only, `SameSite=Lax`). If sign-in returns 401 in production, check the cookie in
DevTools **first**, then `/readyz` `origins`, then `APP_ORIGIN` vs the OIDC redirect URI.

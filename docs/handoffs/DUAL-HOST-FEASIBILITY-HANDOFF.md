# DUAL-HOST FEASIBILITY INVESTIGATION — Handoff

**From:** investigation agent **To:** next roadmap agent / repository owner
**Date:** 22 October 2026
**Task:** dual-host feasibility (Vercel-hosted build + Freebuff-hosted build of the same codebase,
one authoritative backend/database/identity) — investigation only, as named by
`docs/handoffs/ROADMAP-TASK-02-HANDOFF.md` §9
**Report:** `docs/audits/DUAL-HOST-FEASIBILITY.md` (read first — it carries all raw evidence)

> **Do not start any implementation, roadmap TASK 03, merge, deploy, migration, or OIDC client
> registration without the owner's explicit instruction.** This task was documentation + public
> probes only, and it stays that way until the owner answers the decision points in §9 of the report.

## 1. Task ID / status

**DUAL-HOST FEASIBILITY INVESTIGATION — COMPLETE (documentation-only).** The answer is *feasible
with named gaps*: one backend is mandatory (Freebuff's D1 is unreachable outside its own Worker),
cross-host browser calls are impossible today (no CORS anywhere, single-`APP_ORIGIN` mutation
guard), and the session cookie cannot travel from `*.vercel.app` to `*.freebuff.page`
(`SameSite=Lax` + `__Host-` host-only). Multiple OIDC redirect URIs per client ARE supported
(append-only), so identity across two hosts is a registration step, not a redesign.

Nothing implemented: no code, dependency, schema, auth, CORS or deployment-config change; no
deploy, migration, merge, PR, or client registration.

## 2. Branch and exact commit SHAs

- Branch: **`task/TASK-01-reconcile-ci`** (pushed to `origin`, **not merged**)
- Base of this task: `c1b6971` (Freebuff database access probe tip)
- `main`: untouched by this work
- This report + handoff: **one documentation commit directly above `c1b6971`** — the task tip is
  `git rev-parse HEAD` on the branch
- Working-tree edits made before this task's commit: same-day corrections to
  `docs/audits/FREEBUFF_DATABASE_ACCESS_PROBE.md` + `docs/handoffs/FREEBUFF_DATABASE_ACCESS_PROBE-HANDOFF.md`
  (fixed an earlier conflation of this investigation with roadmap TASK 03 “Authentication + prove
  tenant isolation”), included in the same commit

## 3. Changes and file paths

Added: `docs/audits/DUAL-HOST-FEASIBILITY.md`, this file.
Modified (probe naming corrections, above): `docs/audits/FREEBUFF_DATABASE_ACCESS_PROBE.md`,
`docs/handoffs/FREEBUFF_DATABASE_ACCESS_PROBE-HANDOFF.md`.
**Disclosed exception (not created by this task):** one `.gitignore` line — `/freebuff-sites-build/` —
added by the Freebuff platform on 22 Oct 11:25 UTC alongside its generated `freebuff-sites-build/`
build directory (`.freebuff-generated`; vite build succeeded, manifest is Worker-only `spa: false`,
which is why the live site serves no SPA — report §1). The line was sitting uncommitted on the
branch; the commit carries it so the tree ends clean. It ignores generated output only; the
directory itself stays untracked.

Nothing else outside Markdown changed. `src/`, `worker/`, `migrations/`, `tests/`, `package.json`,
`bun.lock`, `wrangler.toml`, `scripts/`, `.env.example` are byte-identical to `c1b6971`.

## 4. Evidence commands (all reproducible)

Live probes were unauthenticated public requests against the already-published Freebuff site
(`https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page`), 22 Oct 2026 ~13:35–14:10 UTC:

```text
# identity flow (303 + PKCE + txn cookie)
curl -sS -o /dev/null -D - 'https://site-…/auth/freebuff/signin'
curl -sS 'https://site-…/auth/freebuff/session'            # {"user":null}
curl -sS 'https://site-…/readyz'                            # auth: ok, client 942e460d-…

# CORS / same-origin guard (no Access-Control-* headers anywhere; OPTIONS → 404;
# foreign-Origin PUT → 403 guard fires before auth; no-Origin PUT → 401;
# POST /api/v1/assets → 404 because create is PUT by convention)
curl -sS -o /dev/null -D - -X OPTIONS -H 'Origin: https://evil.example' \
  'https://site-…/api/v1/assets'
curl -sS -X PUT -H 'Origin: https://evil.example' -H 'content-type: application/json' \
  -d '{"filename":"x"}' 'https://site-…/api/v1/assets'

# SPA absent from Freebuff deployment (API-only site)
curl -sS -o /dev/null -w '%{http_code}' 'https://site-…/index.html'   # 404
```

SDK internals from the pinned tarball (matches `bun.lock` `@freebuff/auth@0.1.0`):

```text
npm pack @freebuff/auth@0.1.0 && tar xzf …
rg -n 'SameSite|__Host-|Access-Control|OPTIONS|redirect_uri' dist/   # cookie + zero CORS
rg -n -- '--redirect-uri' dist/cli.js                                # append-only multi-URI
```

Gates (captured directly, `set -o pipefail`, fresh `node_modules`):

```text
bun install --frozen-lockfile   # exit 0, lockfile unchanged
bun run lint                    # exit 0 — tsc --noEmit
bun run test                    # exit 0 — 59 pass / 0 fail
bun run build                   # exit 0 — dist/ emitted
```

(Re-run on the final tree including this report + handoff: same four exits, 59 pass.)

## 5. Tests added / updated

None — documentation-only, none needed. The 59 existing tests pass unmodified.

## 6. Known issues / honesty nits recorded (not fixed here)

- **`/auth/freebuff/*` fall-through**: on the live, auth-configured deployment,
  `GET /auth/freebuff/login` returns the repo's 503 `auth_not_configured` because `/login` is not
  an SDK route (SDK handles only `/signin|/callback|/signout|/session`); the branch comment in
  `worker/src/index.ts` claims it is only reached when not configured — wrong, and the message is
  misleading. Next honesty sweep.
- **Hardcoded R2 bucket string** in `/readyz` detail (says `manhwa-studio-assets`, real binding is
  `site-8179e1b5…`) — from the probe handoff, still open.
- **Two divergent D1s** (Freebuff-managed `site-1d7d7016…` vs repo `manhwa-studio` `d9557398…`) —
  blocks any “one authoritative backend” claim until the owner picks one.
- Write/read-back half of the database probe remains unverified (needs owner authorization; see
  probe report §7).
- The deployed site's exact commit SHA is unverifiable from the platform side.

## 7. Owner decision points (the blockers)

1. **Shape A** (Freebuff Worker = the single API, Freebuff D1 authoritative) or **Shape B**
   (owner's standalone Worker = single API, owner's D1 authoritative) — report §5.
2. **Domain/cookie strategy** — same-site custom domains, per-host proxy, or documented
   bearer-token alternative; `*.vercel.app → *.freebuff.page` cookie sessions cannot work
   (report §2.4, §6).
3. **OIDC callback registration** for the second host — who runs
   `npx @freebuff/auth register --redirect-uri …` (owner login; append-only, supported).
4. Whether roadmap TASK 03 (auth + two-tenant isolation against a real session) runs **before**
   dual-host implementation, as its handoffs require.

## 8. Exact next task and prerequisites

**Next: owner answers §7.1–§7.2**, then one implementation task can deliver the gap list in report
§7.2–§7.5 (origin allow-list + CORS, cookie/topology wiring, SPA deployment to both hosts,
Supabase backup job inside the authoritative Worker) as one coherent change set with new
cross-origin/allow-list tests. Roadmap TASK 03 remains prerequisite to claiming verified sign-in
and tenant isolation. **Nothing in this branch may be deployed, merged, or migrated without
explicit owner authorization. Do not re-enable GitHub Actions.**

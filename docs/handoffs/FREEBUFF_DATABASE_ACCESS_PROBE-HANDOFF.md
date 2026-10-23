# FREEBUFF DATABASE ACCESS PROBE — Handoff

**From:** probe agent **To:** next roadmap agent / repository owner
**Date:** 22 October 2026
**Report:** `docs/audits/FREEBUFF_DATABASE_ACCESS_PROBE.md` (read it first — it carries all raw evidence)
**Context:** executed after ROADMAP TASK 02 per owner instruction; supersedes nothing

## 1. Task ID / status

**PROBE — COMPLETE. Documentation-only commit.** No code, dependency, schema, auth, provider or
deployment-config change; no deploy, no migration, no merge, no PR, no TASK 03 work.

**Result: PARTIALLY VERIFIED (F)** — a real read query against Freebuff's built-in database
**succeeded from the live production Worker**; write/read-back was deliberately not attempted
(production database, no authorization); no supported *external* interface exists (classification A).

## 2. Branch and exact commit SHAs

- Branch: **`task/TASK-01-reconcile-ci`** (pushed, **not merged**)
- `main`: `49ed52c9f960b8e50ab61a21a6f2bfc7128fa5a2` — unchanged, 0 behind
- Base (TASK 02 tip): `292ea0b0f717c8ddef9aa61b05f9f8c466d7f72c`
- **Probe tip:** `git rev-parse HEAD` on the branch after this commit — it differs from `292ea0b`
  only by this handoff and `docs/audits/FREEBUFF_DATABASE_ACCESS_PROBE.md`

## 3. What is done (verified with real evidence)

- **Live production read probe (the point of the subtask):** the owner's published site
  `https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page` (site `Manhwa-beta`,
  `e2c278d1-f97b-4990-9b14-3df3d60b3997`) runs this repo's `manhwa-studio-api` Worker with bindings
  **`DB` (D1)** and **`FILES` (R2)** on Freebuff's platform account `6e5a40dd…`. `GET /readyz` →
  **200**, `d1: ok — "D1 binding answered SELECT 1."` — a real query, twice, 22 Oct 13:36 and
  13:42 UTC. D1 quota confirms live data: 180,224 bytes, 595 rows read, 54 rows written this month.
- **External interface search (negative result, multi-source):** `freebuff.com/docs` → 404,
  `docs.freebuff.com` → NXDOMAIN, sitemap marketing-only, `help.freebuff.com` → 404; npm registry has
  no Freebuff database SDK (`@freebuff/auth` grep: zero d1/database/sql surface); the only conceivable
  external route (Cloudflare's account-scoped D1 REST API) is blocked because the database lives on
  **Freebuff's platform account**, not the owner's (`78bd087d…`).
- **Security posture confirmed live:** `/api/v1/me` and `/api/v1/assets` answer **401** without a
  session; no credentials were read, requested, used or exposed; the repo's `CLOUDFLARE_API_TOKEN`
  was not needed (`.env.local` absent here) and was never opened.
- No diagnostic endpoint added — the existing `/readyz` already is the sanctioned, sanitized,
  read-only diagnostic (report §11–12 explains why a new one would be dead code).

## 4. What is NOT done / deliberately skipped

- **Write/read-back of a test record: NOT verified (F, not G).** Requires owner authorization to
  touch a production database; required setup options are in report §7 (preview environment, or an
  authorized disposable test table).
- No deploy, no migration, no new table, no schema change, no auth change — per subtask scope.
- The deployed production site was deployed via the Freebuff web app; **its exact source commit is
  unverifiable** from the platform side.
- One honesty nit found and only recorded, not fixed (docs-only scope): `/readyz`'s R2 detail string
  hardcodes “bucket manhwa-studio-assets”, but the real binding is the Freebuff-provisioned
  `site-8179e1b5…` bucket. Fact true, string stale — fold into the next honesty sweep.

## 5. Architecture finding that binds the next task

**Freebuff's built-in database is inaccessible to any backend outside the site's own Worker.**
Therefore the dual-host design (Vercel + Freebuff, one backend, one identity, one dataset) has
exactly two viable shapes, both recorded in report §13:

- **Option A:** the Freebuff-deployed Worker is the single backend (now evidence-backed: it can
  query `env.DB` for real); both frontends call it over HTTPS; Supabase backup is an export job
  inside that Worker.
- **Option B:** the owner's standalone Worker (own account, own D1) is the single backend; the
  Freebuff-hosted build is frontend-only; Freebuff's built-in DB is not primary at all.

**Owner must pick A or B before TASK 03 implementation.** Also reconcile: two D1 databases now exist
(Freebuff-managed `site-1d7d7016…` vs repo `manhwa-studio` `d9557398…`) — they are not the same data,
and keeping both as sources of truth would violate the “no competing copies” requirement.

## 6. Commands to reproduce the probes (public, read-only)

```text
curl -s https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page/          # 200, repo banner
curl -s https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page/healthz   # 200 {"status":"ok"}
curl -s https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page/readyz    # 200, d1 ok ← the real SELECT 1
curl -s https://site-ad1c922229fc492d966ca1d060a96319.freebuff.page/api/v1/me # 401 unauthorized
# bindings/quota: sites_inspect (Sites tooling) on site e2c278d1-f97b-4990-9b14-3df3d60b3997, production
```

Gates: unchanged by this commit; the four local gates (install/lint/test/build) still exit 0 as
recorded in `docs/audits/ROADMAP-TASK-02-IMPLEMENTATION-REPORT.md` §4.

## 7. Recommended next task (exact)

**Dual-host feasibility investigation** (the task named in `docs/handoffs/ROADMAP-TASK-02-HANDOFF.md`
§9 — *not* roadmap TASK 03, which is “Authentication + prove tenant isolation” and remains a separate,
blocked-on-owner prerequisite; corrected 22 Oct after an earlier draft conflated the two), starting
from the owner's Option A/B decision above, then answering: multi-origin OIDC client registration,
CORS/`APP_ORIGIN` allow-list for two hosts (never `*`), where the Supabase export job runs, and which
database is authoritative. **Do not start implementation of either, deploy, or migrate without the
owner's explicit instruction.**

## 8. Warning

Never attempt to reach Freebuff's built-in database through guessed endpoints, Cloudflare account
tokens for the platform account, or undocumented internals — the probe established there is no
supported path, and inventing one would be a security violation. Passing probes on the published
site are observations of the owner's live production deployment; treat that environment accordingly.

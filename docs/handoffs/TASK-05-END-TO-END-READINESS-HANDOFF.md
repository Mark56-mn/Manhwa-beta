# TASK 05 — End-to-End Readiness Handoff

## Repository and branch

- Repo: `Mark56-mn/Manhwa-beta` (`origin` = `https://github.com/Mark56-mn/Manhwa-beta.git`)
- Task branch: `task/TASK-05-END-TO-END-READINESS`
- Base: `task/TASK-04-PERSISTENT-STORY-GENERATION` tip `1f9d2a6ab5350088d726739a21c2ea79415a7009`
- Lineage behind that base: Task 04 `fbd9cf9` → Task 03 `3e26b77` → shared foundation `2bbd155` → Task 01 `905bf57` → `origin/main` `49ed52c`
- Final commit on this branch: the tip of `task/TASK-05-END-TO-END-READINESS` (see `git log -1`); it adds the three TASK 05 documents, `tests/task-05-story-reliability.test.ts` and `tests/tsconfig.json`.

## What changed in this task

Documentation and tests only. No application module, migration, deployment config or dependency was modified.

- `tasks/TASK-05-END-TO-END-READINESS.md` — scope, acceptance criteria, required configuration (names only).
- `docs/audits/TASK-05-END-TO-END-READINESS-REPORT.md` — audit with per-item verification status.
- `docs/handoffs/TASK-05-END-TO-END-READINESS-HANDOFF.md` — this file.
- `tests/task-05-story-reliability.test.ts` — 13 tests over the real `worker/src/story.ts`, `worker/src/credits.ts` and the real migrations in SQLite:
  - duplicate `(project_id, version)` Story Bible and `(project_id, episode_number, version)` episode inserts are rejected by the database (the final guard against a MAX-then-INSERT race);
  - a second, differently-keyed generation cannot be funded once the balance is below the cost — it returns `402 insufficient_credits`, creates no content, and is recorded as a `failed` job with `error_code = insufficient_credits`;
  - `settleCredits` / `releaseCredits` are idempotent (exactly one ledger row each), a settled hold cannot be released, a failed job cannot be settled later, and failed jobs leave no held credits;
  - reservation refusal leaves no hold and no balance change;
  - free-plan `image` / `voice` / `video` are rejected with `403 plan_restricted` before any job row or credit movement;
  - tenant B cannot read, write, generate into, approve or settle against tenant A's story surfaces, and credit balances stay isolated.
- `tests/tsconfig.json` — extends the repo config and restates `noEmit`, so the test tree typechecks without touching the app config.

## Tests and actual results

Executed in this workspace on the final tree, from the committed `bun.lock`:

| Gate | Command | Result |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | pass, 126 packages, lockfile unchanged |
| Typecheck | `bun run lint` (`tsc --noEmit`) | pass, exit 0 |
| Tests | `bun test` | **260 passing, 0 failing, 17 files, 846 `expect()` calls** |
| Build | `bun run build` (`vite build`) | pass, exit 0 (only the pre-existing >500 kB chunk advisory) |
| Whitespace | `git diff --check` | pass, exit 0 |

Two assertions in the new file failed on first run and were corrected as test bugs, not by relaxing the implementation: a bind-parameter count mismatch on a manual `story_bibles` INSERT, and an "exhausted balance" case that actually still had 90 credits (now drained to 5 before the second attempt). Details are in section 6 of the audit report.

## What is verified, and how

- VERIFIED locally: route/module behaviour and schema invariants above, against real migrations in SQLite with injected identity and provider.
- AUTOMATED TEST ONLY: story generation, episode generation, credits, jobs, tenant isolation, free-plan rejection.
- BLOCKED (no credentials in this environment): real OIDC sign-in/callback/session/logout, real Gemini generation, live D1 two-tenant verification, live preview/production hosting checks.
- REQUIRES OWNER AUTHORIZATION: registering the OIDC client, setting deployment secrets, applying migrations `0002`/`0003` to any database, deploying or publishing.

## Known bugs and limitations

- Live authentication is unverified. No OIDC client is registered, so sign-in, callback, cookie attributes in a real browser, logout and expiry have never been exercised end to end.
- Live provider is unconfigured. `GEMINI_API_KEY` and `GEMINI_MODEL` are absent, so real generation returns the honest `provider_not_configured` path and nothing was fabricated.
- No scheduler exists. Generation runs synchronously inside the request; a worker killed after reserving credits can leave a job `running` with a held credit until an explicit recovery path is invoked. Terminal transitions are idempotent, so recovery is safe, but nothing runs it automatically.
- Version allocation is read-then-insert. Duplicate versions are impossible because of the unique constraints (proven by test), but a fully atomic allocation statement is still a possible future improvement, not a current defect.
- `cancelled` and `recovery required` are not first-class Story Studio states, because no cancellation or recovery execution path exists yet.
- Multi-organization membership resolution has not been exercised with a user who belongs to more than one organization; the current code resolves one membership per user and does not offer an active-organization picker.
- Migrations `0002` and `0003` have been reviewed and exercised against in-memory SQLite only; they have never been applied to the live D1 database.

## Required environment variables (names only)

- `FREEBUFF_CLIENT_ID`
- `FREEBUFF_ISSUER`
- `APP_ORIGIN`
- `ALLOWED_ORIGINS` (only if a second browser origin must be allowed)
- `GEMINI_API_KEY` (secret; server-side only)
- `GEMINI_MODEL` (secret or `[vars]`; server-side only)
- `DB` (D1 binding, already declared in `wrangler.toml`)
- `FILES` (R2 binding, already declared in `wrangler.toml`)
- `VITE_API_BASE_URL` (frontend build-time API origin; empty means same-origin)

Never commit these values. Owner-side secret settings only.

## Exact next steps

1. Owner: register the Freebuff OIDC client for the preview origin(s), then set `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN` and, if needed, `ALLOWED_ORIGINS` in the deployment environment.
2. Owner: set `GEMINI_API_KEY` and `GEMINI_MODEL` in the server-side secret store, then run one bounded connectivity check (single short prompt) against the preview deployment.
3. Owner: authorize applying `migrations/0002_assets_and_replication.sql` and `migrations/0003_story_generation.sql` to the preview D1 database only, then verify with `SELECT name FROM sqlite_master WHERE type='table'` and a two-account tenant-isolation pass in the browser.
4. Then run the Stage G flows 1, 3, 4 and 5 against the preview with two real test accounts; nothing about live auth or live generation may be reported as passing before that.
5. Files to inspect first: `worker/src/index.ts`, `worker/src/auth.ts`, `worker/src/identity.ts`, `worker/src/story.ts`, `worker/src/credits.ts`, `worker/src/ai.ts`, `migrations/0002_assets_and_replication.sql`, `migrations/0003_story_generation.sql`, `tests/story-generation.test.ts`, `tests/auth-hardening.test.ts`, `tests/task-05-story-reliability.test.ts`, `src/lib/api.ts`, `src/components/StoryStudio.tsx`, `wrangler.toml`, `docs/DEPLOYMENT.md`.

## What must not be repeated

- Do not re-add the reliability tests, the TASK 05 documents, or another `tests/tsconfig.json`; they exist and pass.
- Do not re-run the "decide the tsconfig shape" question: the repo keeps `types: ["vite/client", "bun"]` because `tests/` imports `bun:test` and `bun:sqlite`, and typecheck passes with it.
- Do not weaken auth, CSRF/origin checks, tenant scoping or credit invariants to make anything pass.
- Do not claim live sign-in, live generation or live D1 isolation without having actually run it.
- Do not register an OIDC client, change production secrets, apply live migrations, merge or deploy without explicit owner authorization.
- Do not commit secrets, tokens, cookies, keys or `.env` files.

# TASK 04 — Persistent Story Generation & 100-Credit Free Tier Report

**Task:** [`tasks/TASK-04-PERSISTENT-STORY-GENERATION.md`](../../tasks/TASK-04-PERSISTENT-STORY-GENERATION.md)
**Date:** 23 October 2026
**Scope:** code + migrations + tests + docs. **Nothing deployed, merged, migrated, or charged live.**

## 1. Branch and commits

| Item | Value |
|---|---|
| Branch | `task/TASK-04-PERSISTENT-STORY-GENERATION` |
| Base | `3e26b77a12f517f775da212bc0e6e580f8d020cf` (verified TASK 03 tip, local = remote) |
| Implementation commit | `fbd9cf941b602abfadd27b1e27ccd810cc2bc25a` |
| `origin/main` | `49ed52c9f960b8e50ab61a21a6f2bfc7128fa5a2` — untouched, not merged |

The working tree was clean at the base commit; no branch was reset and no prior work was overwritten.

## 2. What this task delivers

One coherent vertical slice on the existing Worker/D1 backend:

1. A signed-in tenant can create a cloud project and save a project profile.
2. It can generate a Story Bible and an episode outline/script through a real server-side provider,
   with every result validated before it is persisted.
3. Story Bibles and episodes are versioned; regeneration never overwrites prior content.
4. Every generation is a durable job with a safe status, attempts, provider/model metadata and an
   error code — never a fabricated success.
5. The free plan receives exactly **100 writing credits per organization**, enforced by the server
   with an atomic reserve → settle/release ledger.
6. Free accounts are rejected for image, voice and video at the backend, before any job or charge.
7. The existing Project Hub gains a **Story Studio** that renders loading, sign-in, auth-unconfigured,
   provider-unconfigured, insufficient-credit, generating, saved, failed and network states, and
   clearly separates browser-local drafts from cloud records.

## 3. Files changed

| File | Change |
|---|---|
| `migrations/0003_story_generation.sql` *(new)* | Additive tables: `project_profiles`, `story_bibles`, `episodes`, `generation_jobs`, `credit_accounts`, `credit_holds`, `credit_ledger`; indexes, CHECKs, unique idempotency keys. |
| `worker/src/ai.ts` *(new)* | Gemini adapter: header key, `Promise.race` timeout (default 60 s), max output tokens (default 4096), typed failures, no fallback, no logs. |
| `worker/src/storyContent.ts` *(new)* | Strict bounded Story Bible/episode validation and prompt builders. |
| `worker/src/credits.ts` *(new)* | Exactly-once 100-credit grant, atomic reservation, settlement, idempotent release, append-only ledger, no-negative invariant. |
| `worker/src/story.ts` *(new)* | Tenant-scoped routes for profile, Story Bible, episodes, jobs, credits and synchronous bounded generation. |
| `worker/src/index.ts` | Mounts the story router after the projects router. |
| `worker/src/env.ts` | Documents `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`. |
| `worker/src/projects.ts` | Project responses carry `description`, `language`, `target_audience`; create/PATCH persist them in `project_profiles`. |
| `src/lib/api.ts` | Typed client methods and response validators for credits, profiles, Story Bibles, episodes, jobs and generation; new 402/503 error kinds; parsed error payload for failed jobs. |
| `src/lib/storyWorkspace.ts` *(new)* | Pure Story Studio state machine: board loading, honest failure mapping, idempotency-key reuse policy, edit/approve/profile helpers. |
| `src/components/StoryStudio.tsx` *(new)* | Server-backed profile form, Story Bible editor, generation forms, cost display, job state, episodes/approval, credit history. |
| `src/components/CloudWorkspacePanel.tsx` | Opens a selected cloud project in Story Studio; new projects are selected after the server confirms them. |
| `src/components/ProjectHub.tsx` | Honest copy: server generation exists; video/publishing do not. |
| `tests/story-generation.test.ts` *(new)* | 23 route/schema/credit/job/isolation tests against real migrations in SQLite. |
| `tests/ai-provider.test.ts` *(new)* | 12 provider tests with injected fetch; no network. |
| `tests/story-workspace.test.ts` *(new)* | 19 frontend state/failure tests; no browser. |
| `tests/story-security.test.ts` *(new)* | Static guards for key/host isolation, no logging/persistence of credentials, server-owned cost. |
| `tests/projects.test.ts`, `tests/auth-hardening.test.ts`, `tests/tenancy.test.ts`, `tests/helpers/d1.ts` | Apply `0003`; D1 helper now mirrors `meta.changes`; schema inventory updated; project-profile coverage added. |
| `README.md`, `.env.example`, tasks/report/handoff | Counts, provider variables, migration status, costs and blockers. |

No dependency or lockfile change. `bun install --frozen-lockfile` reports no changes.

## 4. Database migration and application status

`migrations/0003_story_generation.sql` is **committed and UNAPPLIED** to every live database. It is
additive (`CREATE TABLE/INDEX ... IF NOT EXISTS`), never alters or deletes existing rows, and is safe
to re-run. Tests execute it against in-memory SQLite together with `0001` and `0002`; `0002` also
remains unapplied live.

Not executed (needs owner authorization and Cloudflare credentials):

```bash
bunx wrangler d1 migrations apply manhwa-studio --local   # local only
bunx wrangler d1 migrations apply manhwa-studio --remote  # production — NOT run
```

### Tables added

- `project_profiles` — description, language, target audience, update time, one row per project.
- `story_bibles` — versioned premise, synopsis, worldbuilding, rules, characters, locations, factions,
  timeline, continuity, themes, tone, structure, arcs; `UNIQUE(project_id, version)`.
- `episodes` — versioned title, outline, script, status, job reference;
  `UNIQUE(project_id, episode_number, version)`.
- `generation_jobs` — tenant/project/type/status/attempts/idempotency/error/provider/model/output/
  timestamps; `UNIQUE(organization_id, idempotency_key)`.
- `credit_accounts` — server-owned plan, balance (`CHECK >= 0`), initial grant timestamp.
- `credit_holds` — one hold per job (`UNIQUE(job_id)`), amount, held/settled/released.
- `credit_ledger` — append-only signed amounts, balance snapshot, idempotency key, reason, job.

## 5. API routes and contracts

Every route requires a verified Freebuff session, a member organization, and (for mutations) an
allow-listed Origin. Responses are `Cache-Control: private, no-store`. Cross-tenant IDs answer 404.

| Method & path | Success | Notes |
|---|---|---|
| `GET /api/v1/credits` | `200 {credits:{balance,plan,initial_granted_at,costs}, history[]}` | Issues the one-time 100 grant on first read. History capped at 50. |
| `GET /api/v1/projects/:id/profile` | `200 {profile}` (`null` before save) | Org-scoped join to `projects`. |
| `PUT /api/v1/projects/:id/profile` | `200 {profile}` | `description` ≤2000, `language` ≤40, `targetAudience` ≤200; no credit cost. |
| `POST /api/v1/projects` / `PATCH /api/v1/projects/:id` | existing project routes | Also accept the three profile fields. |
| `GET /api/v1/projects/:id/story-bible` | `200 {story_bible}` | Latest version; `404` if none. |
| `PUT /api/v1/projects/:id/story-bible` | `201 {story_bible}` | Manual edit saves a **new** version; no credit cost. |
| `GET /api/v1/projects/:id/episodes` | `200 {episodes}` | Latest version per episode number. |
| `GET /api/v1/projects/:id/episodes/:number` | `200 {episode}` | Latest version. |
| `PATCH /api/v1/projects/:id/episodes/:number` | `200 {episode}` | Body `{status:"approved"}`; only `ready_for_review` may approve; otherwise `409`. |
| `GET /api/v1/jobs/:id` | `200 {job, output}` | Durable job status/output for the tenant. |
| `POST /api/v1/projects/:id/generations` | `201 {job,output,credits}` | Synchronous bounded generation. Replay: `200 {duplicate:true,...}` with no new charge. |

`POST /generations` body:

```jsonc
// Story Bible
{ "type":"story_bible", "idempotencyKey":"8-128 URL-safe chars",
  "concept":"required", "genre":"optional", "language":"optional",
  "tone":"optional", "targetAudience":"optional" }

// Episode
{ "type":"episode_script", "idempotencyKey":"...",
  "concept":"required", "episodeNumber":1,
  "title":"optional", "notes":"optional" }
```

Error contract: `400 bad_request` (body/type/key/field), `402 insufficient_credits`, `403
plan_restricted` (image/voice/video), `403 forbidden` (origin/membership), `404 not_found`,
`409 conflict` (approval), `429 provider_rate_limited`, `502 provider_auth_failed /
provider_bad_response / provider_unavailable`, `504 provider_timeout`, `503
provider_not_configured / auth_not_configured / not_configured`, `500 server_error`, `401
unauthorized`.

## 6. Credits: costs and ledger behaviour

| Operation | Cost |
|---|---|
| Story Bible generation | **10** |
| Episode script generation | **15** |
| Manual Story Bible edit/save, profile save, reads, approval | 0 |

- **Initial grant:** `ensureCreditAccount` inserts balance 0, then one conditional
  `UPDATE ... WHERE initial_granted_at IS NULL` adds 100. The grant ledger row is idempotent on
  `grant:initial:<org>`. Ten concurrent calls still produce balance 100 and one grant.
- **Reservation:** one conditional `UPDATE credit_accounts SET balance = balance - cost WHERE balance
  >= cost`, then a hold row. It happens **before** the provider call. The ledger records a negative
  `reserve` with the new balance. Failed reservation removes the hold.
- **Settlement:** after validated content is persisted and the job is succeeded, the hold becomes
  `settled` and a zero-value `settle` row is appended. Idempotent.
- **Release:** if the provider fails, content is invalid, or the job fails before billable output, the
  hold becomes `released`, the balance is refunded once, and a positive `release` row is appended.
- **Retries:** repeating a request with the same idempotency key returns the existing job/output and
  never charges again. A definitive failure releases its hold; the next attempt uses a new key. A
  network/timeout uncertainty keeps the key so the replay cannot double-charge.
- **Invariant:** the account CHECK, the conditional debit, and the reservation ordering make a
  negative balance unrepresentable. The browser cannot send a plan, balance, cost or tenant.

Concurrency proof: 20 simultaneous reservations of 10 against 100 credits produced 10 successes, 10
`insufficient_credits`, a final balance of 0 and minimum ledger balance 0; a concurrent duplicate HTTP
submission produced one job, one reserve and one settle.

## 7. AI provider

- Adapter: `worker/src/ai.ts`, provider `gemini`, endpoint
  `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
- **Required server variables:** `GEMINI_API_KEY` **and** `GEMINI_MODEL`. Either both are set or the
  route answers `503 provider_not_configured` before creating a job or touching credits.
- Optional bounds: `AI_TIMEOUT_MS` (default 60 000) and `AI_MAX_OUTPUT_TOKENS` (default 4096). The
  timeout is enforced with a race, so a transport that ignores the abort signal still cannot hang.
- Credential transport: `x-goog-api-key` header only; never a query parameter. It is never logged, never
  returned, and never stored in `generation_jobs` (which stores only provider/model names).
- Output validation: strict JSON shape plus length/array limits; markdown fences tolerated; anything
  else fails the job with `provider_bad_response` and releases the reservation.
- Failure mapping: 401/403 → `provider_auth_failed`; 429 → `provider_rate_limited`; 5xx →
  `provider_unavailable`; malformed/no text → `provider_bad_response`; abort/race →
  `provider_timeout`; transport rejection → `provider_unavailable`.
- **No fallback provider is added.** A compatible fallback remains possible only by explicitly
  configuring another real provider, which this task did not do.
- No paid/free claim is made about the provider: presence of both variables is the only condition.

## 8. Jobs

States: `pending` → `running` → `succeeded` | `failed`. Each job has one bounded attempt
(`max_attempts = 1`), a unique idempotency key per organization, safe error code, provider/model,
output reference and created/started/completed timestamps. Duplicate keys cannot create a second job,
charge or output.

**There is no scheduler, queue, or background execution.** Generation runs synchronously inside the
request, and the job row is durable before/after provider work. The UI does not claim background
processing. See the interrupted-job limitation in §10.

## 9. Verification (final tree)

Environment: Bun **1.4.4**. Every command was run in this workspace with `pipefail` and explicit exit
capture.

```text
bun install --frozen-lockfile   # exit 0 — 126 installs checked, no changes
bun run lint                    # exit 0 — tsc --noEmit
bun run test                    # exit 0 — 247 pass, 0 fail, 783 expect(), 16 files
bun run build                   # exit 0 — dist/ emitted; chunk-size advisory only
git diff --check                # exit 0
```

Baseline was 189 tests / 12 files; **58 tests were added** (57 across 4 new files plus 1 in
`tests/projects.test.ts`), and the existing suites now include `0003`. The built bundle was grepped for `GEMINI_API_KEY` and the provider host:
**absent**.

### Test coverage added

- **Persistence:** Story Bible read after the generating request; profile round-trip; episode list;
  job read; credits after a fresh request.
- **Versioning:** two generations + manual edit produce v1/v2/v3 with all rows retained; episode
  regeneration produces v2.
- **Tenant isolation:** Tenant B gets 404 for Tenant A's profile, Story Bible, episodes, job and
  generation target; B's writes cannot touch A; B has its own 100 credits.
- **Forgery:** body `organization_id`, `created_by_sub`, `plan`, `balance`, `cost` are ignored; the
  stored job and debit stay with the session tenant at the server-owned cost.
- **Sessions/origin:** all story routes 401 with `private, no-store`; media and mutations enforce
  origin via the shared guard.
- **Credits:** exactly-once grant, concurrent grant, concurrent reservations, insufficient balance,
  idempotent release/settle, no negative balance, failed-job refund.
- **Jobs:** replay returns the same output/job without a second charge; a concurrent duplicate
  submission yields one job/one charge; failed jobs record a code and attempts.
- **Provider:** success, malformed output, 401/429/5xx/network, hanging timeout, missing config,
  missing model, no key in errors.
- **Free plan:** `image`, `voice`, `video` → 403 before any job/charge.
- **Frontend:** board ready/empty/401/auth-503/network; success only with saved output; provider,
  credit and sign-in failures; key reuse for uncertain requests; invalid edit; approval conflict;
  profile save failure; job labels.
- **Static security:** no key/model/host in `src/`; no provider logging; no `?key=`; no credential
  column in `0003`; no body-supplied cost/plan/balance/owner; cost read from `CREDIT_COSTS`.

## 10. Known defects and limitations

1. **Live authentication and generation are BLOCKED/UNVERIFIED.** No OIDC client is registered and
   `GEMINI_API_KEY`/`GEMINI_MODEL` are unset. Local preview truthfully shows
   `auth_not_configured`; no real customer or generation was simulated.
2. **No scheduler/reaper.** A process death mid-job can leave a job `running` and its credits held.
   There is no automatic timeout/requeue. This is deliberate (no unconfigured scheduler) and must be
   handled in a later task with real durable execution or an owner-approved reconciliation job.
3. **Different-key concurrency can collide on version numbers.** `MAX(version)+1` is not serialized;
   SQLite's unique constraint makes the losing insert fail, the job refunds, and the caller receives
   an honest 500. Retrying succeeds. No data corruption, but not a polished conflict response.
4. **Post-save infrastructure failure.** If the DB fails after content insert but before
   job/settlement completion, the error path can mark the job failed/release while the content row
   exists. D1 has no interactive transaction in this codebase; this is a narrow DB-failure path, not a
   provider path, and should be revisited with an atomic batch.
5. **No RBAC.** Any organization member can generate, edit and approve. Tenant isolation is intact;
   intra-tenant roles are not enforced. Multi-org users are served their first organization.
6. **Episode statuses** `draft`, `generating` and `failed` exist in the schema but only
   `ready_for_review` and `approved` are produced/consumed. Failed generation is recorded on the job.
7. **No purchase/upgrade path**, no refunds beyond failed-generation release, no per-user (vs
   per-organization) credit accounts, no pagination of ledger/history beyond the 50-row cap.
8. **Two profile write contracts** (`PATCH /projects/:id` and `PUT /projects/:id/profile`) share the
   same table. They are consistent, but redundant; a later cleanup may keep one.
9. **`migrations/0002` and `0003` are unapplied live.** `0001`'s remote status is only inherited from
   the TASK 07 report.
10. **Preview API has no auth/D1 binding.** The local Vite server proxies to a process started with an
    empty env, so it demonstrates the honest `auth_not_configured` state, not a working generation.

## 11. Live checks that remain UNVERIFIED

- Sign-in → callback → session cookie → `/api/v1/me` 200 → project list.
- A real provider generation producing a persisted Story Bible, charged exactly 10, then an episode
  charged exactly 15.
- Live two-tenant isolation against real D1, and live concurrent reservation behaviour.
- Provider live error/quota behaviour (auth, rate limit, outage) with the real account.
- Cookie delivery/cross-domain behaviour (same constraint as TASK 03).

None of these may be reported as passed from local SQLite/injected-provider tests.

## 12. Exact next task

**TASK 05 — Owner-gated live verification of auth + one real generation, then approval/publication.**

1. Owner registers the Freebuff OIDC client for the preview/production origins
   (`https://<origin>/auth/freebuff/callback`) and sets `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`,
   `APP_ORIGIN`, `ALLOWED_ORIGINS`, `GEMINI_API_KEY`, `GEMINI_MODEL` in the deployment secret store.
2. Owner authorizes applying `0002` and `0003` (preview first) and a preview deployment.
3. With two real accounts verify: signed-out 401; sign-in; 100 credits exactly once; Story Bible
   generation saved/charged 10; episode saved/charged 15; replay no double charge; Tenant B 404s
   across every resource; a forced provider failure refunds; image/voice/video 403.
4. Record the observations with timestamps and exclude secrets. Only then mark TASK 03/04
   live-complete. Publication remains a separate owner-approved stage.

Do not merge, deploy, register callbacks, apply migrations or enable CI without the owner's explicit
instruction.

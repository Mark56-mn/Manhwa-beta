# TASK 04 Handoff — Persistent Story Generation

**Read first:** [`docs/audits/TASK-04-PERSISTENT-STORY-GENERATION-REPORT.md`](../audits/TASK-04-PERSISTENT-STORY-GENERATION-REPORT.md)

## 1. Exact repository state

| Item | Value |
|---|---|
| Branch | `task/TASK-04-PERSISTENT-STORY-GENERATION` |
| Base commit | `3e26b77a12f517f775da212bc0e6e580f8d020cf` (TASK 03 tip) |
| Implementation commit | `fbd9cf941b602abfadd27b1e27ccd810cc2bc25a` |
| Report/handoff | one Markdown-only commit above the implementation commit (branch tip) |
| `origin/main` | `49ed52c9f960b8e50ab61a21a6f2bfc7128fa5a2` — not merged |
| Merge / deploy / migration | **none performed** |

If the remote has advanced beyond `fbd9cf9`, inspect its commits before building; do not reset or
force any branch.

## 2. Files changed

**New**
- `migrations/0003_story_generation.sql`
- `worker/src/ai.ts`, `worker/src/storyContent.ts`, `worker/src/credits.ts`, `worker/src/story.ts`
- `src/lib/storyWorkspace.ts`, `src/components/StoryStudio.tsx`
- `tests/story-generation.test.ts`, `tests/ai-provider.test.ts`, `tests/story-workspace.test.ts`,
  `tests/story-security.test.ts`
- `tasks/TASK-04-PERSISTENT-STORY-GENERATION.md`, this report/handoff

**Modified**
- `worker/src/index.ts` (mount story router), `worker/src/env.ts` (AI variables),
  `worker/src/projects.ts` (profile fields in project responses/create/PATCH)
- `src/lib/api.ts` (typed story/credit/profile client), `src/components/CloudWorkspacePanel.tsx`,
  `src/components/ProjectHub.tsx`
- `tests/projects.test.ts`, `tests/auth-hardening.test.ts`, `tests/tenancy.test.ts`,
  `tests/helpers/d1.ts` (apply `0003`; D1 `meta.changes`)
- `README.md`, `.env.example`

No dependencies or lockfile changed.

## 3. Migration status

`0003_story_generation.sql` is **committed, additive, and UNAPPLIED**. It creates:

`project_profiles` · `story_bibles` · `episodes` · `generation_jobs` · `credit_accounts` ·
`credit_holds` · `credit_ledger` — with FKs, CHECKs, unique version/idempotency constraints and
indexes. Every statement is `IF NOT EXISTS` and safe to re-run; no row is altered or deleted.

`migrations/0002` is also still unapplied. Tests run `0001` + `0002` + `0003` against in-memory
SQLite. Applying live requires owner authorization:

```bash
bunx wrangler d1 migrations apply manhwa-studio --local    # local only
bunx wrangler d1 migrations apply manhwa-studio --remote   # production — DO NOT run unauthorized
```

## 4. API summary

All routes: verified session + organization membership; mutations require an allow-listed Origin;
responses `Cache-Control: private, no-store`; cross-tenant IDs → 404.

| Route | Contract |
|---|---|
| `GET /api/v1/credits` | `{credits:{balance,plan,initial_granted_at,costs},history[]}`; first read issues 100 once |
| `GET/PUT /api/v1/projects/:id/profile` | `{profile}`; `description`, `language`, `targetAudience`; 0 credits |
| `GET/PUT /api/v1/projects/:id/story-bible` | Latest `{story_bible}` / save a **new** version (`201`); 0 credits for manual save |
| `GET /api/v1/projects/:id/episodes[/:number]` | Latest `{episodes}` / `{episode}` |
| `PATCH /api/v1/projects/:id/episodes/:number` | `{status:"approved"}` only from `ready_for_review`; else 409 |
| `GET /api/v1/jobs/:id` | `{job,output}` for the tenant |
| `POST /api/v1/projects/:id/generations` | `201 {job,output,credits}`; replay `200 {duplicate:true}` without new charge |

Generation body (validated server-side):

```jsonc
{ "type":"story_bible", "idempotencyKey":"8-128 URL-safe chars", "concept":"required",
  "genre":"", "language":"", "tone":"", "targetAudience":"" }
{ "type":"episode_script", "idempotencyKey":"...", "concept":"required", "episodeNumber":1,
  "title":"", "notes":"" }
```

Error codes: `400`, `401`, `402 insufficient_credits`, `403 plan_restricted|forbidden`, `404`, `409`,
`429 provider_rate_limited`, `502 provider_*`, `503 provider_not_configured|auth_not_configured|
not_configured`, `504 provider_timeout`, `500 server_error`.

## 5. Credit and job behaviour

- Costs: **Story Bible 10**, **episode script 15**; reads, profile saves, manual bible edits and
  approval are free.
- One-time **100** grant per organization, conditional update + idempotent `grant:initial:<org>`
  ledger key.
- Reserve (atomic conditional debit + hold) → provider → validate → persist → job succeeded → settle.
  Any failure before validated save → job failed + release once.
- Same idempotency key replayed → existing job/output, no second job or charge. Concurrent duplicate
  submissions were tested.
- Free plan: `image`, `voice`, `video` are rejected with 403 **before** job/charge.
- Jobs: `pending → running → succeeded|failed`, `max_attempts=1`, safe `error_code`, provider/model
  names only. **No scheduler/background worker exists**; execution is synchronous and bounded.

## 6. AI provider configuration (names only)

| Variable | Required | Meaning |
|---|---|---|
| `GEMINI_API_KEY` | yes | Server-side Worker secret; sent only in `x-goog-api-key`. |
| `GEMINI_MODEL` | yes | Explicit model id; no default is invented. |
| `AI_TIMEOUT_MS` | optional | Default 60 000; enforced by a race. |
| `AI_MAX_OUTPUT_TOKENS` | optional | Default 4096. |

Without both required variables: `503 provider_not_configured`, **no job and no charge**. Never put a
real value in git, chat, logs or a `VITE_` variable. The key is never persisted; `generation_jobs`
stores only provider/model names.

## 7. Verification recorded on the delivered tree

```text
bun install --frozen-lockfile   # exit 0, no changes
bun run lint                    # exit 0
bun run test                    # exit 0 — 247 pass, 0 fail, 783 expect(), 16 files
bun run build                   # exit 0 (chunk-size advisory only)
git diff --check                # exit 0
```

58 tests were added. The built bundle contains no provider key/model/host. Preview on port 3001 is
running against a local API with **no auth client**, so it deliberately shows
`auth_not_configured`; that is the honest state, not a working sign-in.

## 8. Live checks that are BLOCKED / UNVERIFIED

Do **not** report these as passed:

1. Real sign-in → callback → cookie → `/api/v1/me`.
2. Real provider Story Bible and episode generation, with persisted content and exact 10/15 charges.
3. Two real accounts and live D1 tenant isolation.
4. Live provider rate-limit/auth/outage handling.
5. Cookie/cross-host behaviour.
6. Any deployed environment. Nothing in this task was deployed.

Blockers: no registered OIDC client, no `GEMINI_API_KEY`/`GEMINI_MODEL`, no authorized deployment or
migration, no two real accounts.

## 9. Known defects to carry forward

- No scheduler/reaper: an interrupted synchronous job can remain `running` with credits held.
- Version allocation is `MAX+1`; two different-key concurrent generations can collide and one gets an
  honest 500 after refund (unique constraint prevents corruption).
- Post-save DB failure can leave content with a failed/released job; no interactive D1 transaction.
- No RBAC; any member can generate/edit/approve. Multi-org users get their first organization.
- Episode `draft`/`generating`/`failed` statuses are schema-only; failures live on the job.
- No purchase/upgrade, per-user credits, or history pagination beyond 50 ledger rows.
- Redundant profile write paths (`PATCH /projects/:id` and `PUT /projects/:id/profile`).
- `0001` remote status is inherited from the TASK 07 report, not re-verified here.

## 10. Exact next task

**TASK 05 — owner-gated live verification of auth + one real generation (then approval/publication as a
separate task).**

Instructions for the next agent:

1. Confirm the branch tip and that `origin/main` is untouched. Read this handoff and the report.
2. Ask the owner (do not guess or fabricate):
   - register the Freebuff OIDC client per deployed origin with
     `https://<origin>/auth/freebuff/callback`;
   - set `FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, `APP_ORIGIN`, `ALLOWED_ORIGINS`;
   - set `GEMINI_API_KEY` and `GEMINI_MODEL` in the deployment secret store;
   - authorize a preview deployment and application of `0002` + `0003` (preview first).
3. Verify with two real accounts and record evidence without secrets:
   signed-out 401 → sign-in → `/api/v1/me` 200; exactly 100 credits once; Story Bible saved and
   charged 10; episode saved/reviewed/approved and charged 15; replay of the same key does not
   double-charge; Tenant B receives 404 for every Tenant A resource; a forced failure (bad model or
   revoked key) yields `provider_*` and a refund; image/voice/video → 403.
4. Only then update the capability inventory and mark TASK 03/04 live-complete. Keep publication
   (YouTube) and any scheduler out of scope until separately approved.

Do not merge, deploy, register callbacks, apply migrations, schedule jobs, or enable GitHub Actions
without the owner's explicit instruction.

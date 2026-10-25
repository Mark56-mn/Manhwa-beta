# Manhwa Studio — Consolidated Product & Engineering Blueprint

**Status:** Proposed canonical blueprint; design document only  
**Canonical implementation repository:** `Mark56-mn/Manhwa-beta`  
**Source repository to mine for proven backend capabilities:** `Mark56-mn/manhwa-studio`  
**Purpose:** Combine the original Manhwa Studio product plan with the useful interface and workflow features added in Manhwa Beta, then build one coherent, honest, multi-tenant production application.

> This document is a plan, not evidence that the listed integrations are already implemented in Manhwa Beta. Existing code must be inspected and tested before being considered reusable. Do not delete either repository until the migration is reviewed, verified, deployed, and backed up.

---

## 1. Executive decision

Keep **Manhwa Beta as the destination repository** because it contains the Google AI Studio-era interface and creator-workspace components that we want to preserve. Bring the useful, proven backend patterns and implementations from **Manhwa Studio** into Beta in deliberate, reviewed steps.

Do not copy both repositories wholesale and do not run two competing backends. First complete an inventory and mapping. Port reusable modules with their tests, migrations, security controls, documentation, and attribution/history intact. Rework or discard duplicate implementations when needed.

### Recommended first architecture

Manhwa Studio already documents and implements a compact architecture: a responsive React SPA served from a Cloudflare Worker using Hono, D1 for relational data, R2 for media objects, server-side Freebuff OIDC authentication, SQL migrations, and worker-based API routes. It also has a provider adapter layer and versioned script generation.

**Recommendation:** Use that existing Cloudflare Worker + Hono + D1 + R2 architecture as the default consolidation target, because it avoids introducing a second persistence/auth stack and lets us reuse the strongest working foundation. Preserve the right to revisit the choice only after a short architecture review.

This recommendation supersedes the earlier unexecuted plan to start a separate Firebase Auth/Firestore foundation. Do **not** implement Firebase in parallel with D1 unless the owner explicitly changes the architecture decision. If a required capability cannot be safely ported, document the gap and alternatives before changing stacks.

Cloudflare request handlers must remain short-lived. Long AI jobs and FFmpeg rendering run in durable job orchestration and external workers/notebooks, not inside a normal HTTP request.

---

## 2. Product vision

Manhwa Studio is a multi-customer web production studio for turning an original story into consistent, narrated, edited manhwa/motion-comic episodes and, after approval, publishing them to YouTube.

It is not just a script generator, a mock dashboard, or a personal-only tool. It is a creator workspace and production control center. It must support multiple customers, each with isolated accounts, projects, credentials, assets, usage, approvals, and YouTube connections.

### Core user journey

1. Customer signs in and creates a project.
2. Customer defines the story bible: premise, world rules, characters, visual identity, terminology, canon facts, and constraints.
3. Customer creates a season and episode brief.
4. Director/Showrunner agent proposes a structured production plan grounded in the approved story bible.
5. Customer reviews and approves the plan.
6. Story agent generates a versioned script and scene breakdown.
7. Customer reviews, edits, approves, rejects, or requests changes to that version.
8. Character/Continuity agent prepares or checks character references and scene consistency.
9. Image agent generates real scene art using an available, eligible provider.
10. Voice agent creates or imports real narration/audio.
11. Rendering worker assembles art, narration, sound, subtitles/captions, timing, transitions, and credits into a playable MP4.
12. QC validates actual artifacts and reports issues.
13. Customer previews the video and approves the exact render version.
14. YouTube integration uploads private/unlisted first when enabled.
15. Public release remains a separate action requiring explicit owner confirmation for that exact uploaded version.
16. Every step creates an auditable event and preserves artifact/version history.

A step is complete only when its required artifact exists and passes validation. An agent response, database row, progress animation, HTTP 200, or mocked provider response is not proof of production success.

---

## 3. What to preserve from each repository

### A. Manhwa Beta — preserve and improve the creator experience

Inspect and retain useful components where they are maintainable:

- Modern Dark Webtoon aesthetic: deep slate background, cyan/violet accents, panel-like borders, readable typography, responsive layout.
- Dashboard and project hub.
- New-project flow and onboarding/getting-started guide.
- Story Bible editor.
- Episode/script editor.
- Character and world-building workflows represented by existing data models.
- Approval Center as the central review workspace.
- Project analytics, but only metrics derived from real stored records.
- Navigation, project cards, forms, editing patterns, and other useful mobile-first interface details.
- Demo/sample projects for onboarding, clearly separated from customer data and never presented as real generated output.
- Existing task/report/handoff discipline and the 15-task roadmap, after it is reconciled with this blueprint.

Do not assume these screens are fully functional because they exist. Audit each button, data flow, state transition, and persistence operation. Keep the useful visual design while replacing demo-only actions with real API operations.

### B. Original Manhwa Studio — port proven backend foundations

Inspect the source code and its reports/tests, then selectively port or adapt:

- Cloudflare Worker + Hono API foundation and same-origin SPA/API routing.
- Server-side Freebuff OIDC login/session implementation, CSRF protections, and authenticated routes.
- D1 schema and migrations for accounts, projects, seasons, episodes, characters, story bible, activity history, script versions, script approvals, scenes, and provider checks.
- Server-side provider adapters and capability status checks.
- Structured script prompts, output parsing/validation, immutable script versions, and append-only review decisions.
- R2 object storage and asset metadata API.
- Health/readiness and integration-status endpoints.
- Automated tests running against the worker runtime and D1, plus local/deployed verification scripts.
- Honest state vocabulary and detailed task handoffs.
- The phased production roadmap for image generation, continuity, voice, rendering, orchestration, YouTube upload, publication approval, and launch review.

**Important:** Verify each source feature against its source branch, test suite, implementation report, and deployed status. A source-repository claim is evidence to inspect, not permission to mark the feature complete in Beta without porting and verification.

### C. Do not port blindly

- Do not copy the original single-owner assumptions into the multi-tenant product.
- Do not copy sample outputs or demo behavior as live AI features.
- Do not expose provider secrets to the browser.
- Do not copy a feature without its migrations, authorization, tests, and handoff.
- Do not preserve duplicate persistence systems or duplicate AI routers.
- Do not import Firebase merely because an earlier Beta task mentioned it; the recommended target is one Cloudflare/D1/R2 architecture unless a deliberate architecture decision changes this.
- Do not represent the original repository’s features as already available in Beta.

---

## 4. Required product modules

### 4.1 Account, tenant, and access control

- Server-side authentication with secure sessions.
- Each account’s projects, assets, provider configuration, usage, and YouTube connections are isolated.
- Every private API request derives the active user from the authenticated session, never from a client-supplied owner ID.
- Add explicit membership/roles if team collaboration is introduced; do not infer permissions from a project ID.
- Enforce ownership in every read, update, delete, generation, approval, asset, and publishing endpoint.
- CSRF protection on state-changing browser requests; safe cache headers on private responses.
- Account deletion/export policies must be defined before public launch.
- Do not store customer API credentials in localStorage, sessionStorage, frontend build variables, source files, analytics events, or logs.

### 4.2 Project and Story Bible workspace

The persistent Story Bible is the canon/source of truth. It must include versioned records for:

- Project premise, logline, synopsis, genre, tone, audience, themes, and art style.
- World rules, locations, factions, technology/magic rules, and glossary/terminology.
- Characters: names, roles, descriptions, personality, motivations, relationships, abilities, visual anchors, reference images, voice notes, and continuity constraints.
- Long-term plot, arcs, foreshadowing, unresolved threads, timeline, and canon facts.
- Seasons, episode briefs, outlines, scripts, scenes, dialogue, narration, SFX, image prompts, and timing.
- Decisions and approved/rejected versions.
- Assets and provenance.
- Continuity warnings and resolutions.

Changes to canon should create history or versions; generated work must reference the specific approved Story Bible version used. Never silently rewrite approved canon because an agent produces a new answer.

### 4.3 Episode and script workspace

- Episode title, number, season, synopsis, target duration, status, and brief.
- Structured scene list with scene number, setting, visual action, dialogue, narration, sound effects, shot/panel direction, image prompt, character references, and estimated duration.
- Manual editing remains available even when AI is unavailable.
- Generation creates immutable versions with provider/model, prompt/template version, source Story Bible version, timestamp, parse state, and relevant usage metadata.
- Approvals are append-only decisions; approving a version must not mutate its content.
- Malformed model output is stored as unparsed/failed with an explanation; never invent missing scenes to make it look valid.

### 4.4 Director / Showrunner and specialized agents

The Director is a coordinator, not a pretend chat persona. It creates a durable plan and dispatches actual tasks to specialized workers:

- **Director/Showrunner:** plans dependencies and production sequence.
- **Story Agent:** story bible support, outlines, scripts, dialogue, narration text.
- **Character/Continuity Agent:** checks canon, visual anchors, timeline, and character consistency.
- **Image Agent:** generates or imports scene images and maintains versioned alternatives.
- **Voice Agent:** generates/imports narration, with voice choice and pronunciation notes.
- **Video/Rendering Worker:** assembles a motion-comic episode.
- **Quality-Control Agent:** validates script schema, asset completeness, audio/video properties, captions, and continuity checks.
- **Publishing Agent:** prepares uploads and reports status; it cannot bypass owner approval.

Each agent task needs a stable ID, tenant/project/episode scope, input version references, dependencies, status, attempts, timeout, cancellation state, logs, output artifact references, and error details. Agents communicate through persisted task records and events—not only through in-memory chat messages.

### 4.5 AI provider gateway and model selection

- One server-side provider gateway; provider-specific code stays behind adapters.
- Support configured/verified providers and models through an explicit registry. Candidates may include Google/Gemini, OpenRouter, NVIDIA NIM, OpenAI-compatible endpoints, and other providers only after their API, model ID, terms, and price are verified.
- Allow the user to choose provider/model for each supported task where appropriate. Show capability, availability, limitations, estimated cost when known, and whether the route is free or paid.
- Initial global cost policy is **FREE_ONLY**. No automatic paid fallback, no hidden credit use, and no assuming that a provider or model is free because a label says “free.”
- If no eligible free model is configured/available, pause with a clear message. BYOK or paid use requires explicit setup/consent and must still obey the account’s policy.
- Store provider/model provenance for every generated artifact.
- Provider states must be truthful: `connected_verified`, `configured_unverified`, `not_configured`, `unavailable`, or `failed`.
- Only a real authenticated verification call may mark a provider verified.
- Enforce timeouts, bounded retries, rate-limit handling, input/output limits, and redaction of credentials.
- Never return API keys or secret values to the browser. Return missing variable names, not secret values.

### 4.6 Credits and plan limits

- The initial free allowance is **100 credits for story writing, Story Bible assistance, and script generation only**.
- Image generation, voice generation, and video rendering are not included in that free allowance.
- Define a server-side ledger for credit reservations, consumption, releases/refunds after failed operations, and idempotency.
- Never rely on a browser-calculated balance.
- Display clear task-level estimated/actual usage where the provider supplies reliable metadata.
- Do not build subscription billing until usage metering, limits, and failure refunds are reliable.
- FREE_ONLY means no paid provider call without explicit owner authorization even if a credit counter exists.

### 4.7 Image and character continuity pipeline

- Generate actual image bytes from a verified adapter or accept user-imported images.
- Use the approved Story Bible and character reference images in prompts.
- Store multiple immutable versions and provenance: provider/model, prompt, source references, dimensions, content type, timestamps, and generation status.
- Let the customer review/select/regenerate each scene’s image.
- QC validates non-empty bytes, allowed format, dimensions, storage success, and references.
- Do not use placeholder thumbnails as generated images. Demo assets must be labeled.

### 4.8 Voice and audio pipeline

- Support a verified voice provider or explicit user-imported audio.
- Track voice identity/configuration, pronunciation notes, script version, scene/line mapping, audio format, duration, rights/consent metadata, and asset version.
- Preview audio before approval.
- Validate real audio bytes, duration, codec/format, and successful storage.
- Verify vendor costs, quotas, licensing, and usage terms before enabling a provider.
- Never state narration is generated unless a real audio artifact is stored and validated.

### 4.9 Video rendering and QC

- Run FFmpeg or equivalent in a suitable external worker/container/notebook, not inside a normal Cloudflare request.
- Render from explicit, versioned inputs: selected images, approved script, approved narration, captions/subtitles, sound, transitions, durations, and branding.
- Produce a real MP4 and store it in R2 with metadata.
- Validate file existence, size, container/codec, duration, resolution, audio stream, caption output when requested, and successful playback/probe.
- Store render logs, source version IDs, QC findings, and immutable render version.
- Failed renders remain failed and are retryable; do not show a success badge because the job was queued.
- Support cancellation, timeout, progress from real worker events, and cleanup of abandoned temporary files.

### 4.10 Approval Center

The Approval Center is the single review inbox for script versions, scene art, narration, final video, and publication readiness.

Every approval refers to an exact immutable artifact/version and records approver, decision, timestamp, optional notes, and the artifact hash/ID. Decisions include approve, reject, or request changes as appropriate. A new render or script version invalidates approval of the older version for downstream steps unless policy explicitly states otherwise.

Approval is not equivalent to publishing. Public release must require a separate explicit confirmation.

### 4.11 YouTube integration

- OAuth tokens are stored securely server-side, scoped to the correct tenant/customer, and never exposed in client logs or URLs.
- Verify OAuth callback/state handling, refresh/expiry behavior, revocation, and minimum required scopes.
- Upload the approved rendered artifact using a resumable upload flow.
- Default upload visibility is private or unlisted; record actual YouTube video ID, processing state, URL, and upload errors.
- Public visibility is a separate operation requiring authenticated owner confirmation for the exact render/upload version and an append-only audit record.
- Agents cannot independently change visibility to public.
- Never claim an upload succeeded until YouTube returns a valid video ID and the stored status is verified.
- Add quota/error handling and a clear reconnect path.

### 4.12 Analytics, activity, and observability

- Project analytics use actual database records: projects, episodes, artifacts, approved versions, task states, elapsed times, and usage data.
- No fabricated pipeline percentages, pretend “real-time telemetry,” or synthetic activity presented as production history.
- Activity history records real events with actor, tenant, object, action, timestamp, and safe metadata.
- Operational health endpoint reports actual database and service readiness; it must not leak secrets or customer information.
- Provider, worker, storage, and YouTube status is reported separately and accurately.

### 4.13 Onboarding and demo mode

- Keep onboarding and sample projects as an optional guided demo.
- Demo records are isolated from real customer projects and are visibly labelled.
- No demo generator may insert fixed sample content into a real project as if generated by AI.
- When an integration is absent, show “Not configured” or “Demo only,” describe what is missing, and provide a clear next step.
- No “coming soon” or fake clickable control should imply the feature is already working; disabled controls should explain why.

---

## 5. Data and asset architecture

Use D1 for relational metadata and workflow state; use R2 for large binary assets. Do not store large image, audio, or video blobs in D1.

Proposed logical records (adapt existing migrations rather than duplicating tables):

- `users` / account profile and OIDC subject.
- `projects`, `project_members` if collaboration is enabled.
- `story_bible_versions`, `characters`, `world_rules`, `glossary_terms`, `continuity_facts`.
- `seasons`, `episodes`, `episode_plans`, `script_versions`, `scenes`.
- `script_approvals`, `artifact_approvals`, `publication_approvals`.
- `assets` with R2 key, type, MIME, byte size, hash, source/provider/model, version, and owning tenant/project.
- `provider_configs` or safe configuration references, `provider_checks`, and model/task policy metadata. Secret values remain deployment secrets or secure server-side secret storage, not ordinary client-visible DB rows.
- `agent_jobs`, `job_dependencies`, `job_attempts`, `worker_events`.
- `youtube_connections`, `youtube_uploads`.
- `usage_ledger`, `credit_reservations`.
- `activity_events`.

Use explicit foreign keys and indexes. Every tenant-owned table needs an ownership path enforced by the server. Asset download URLs must be authorized and short-lived when signed URLs are used. Deletion and retention rules must clean up orphaned R2 objects safely.

### Versioning rules

- Approved scripts, plans, images, audio, and renders are immutable artifacts.
- Edits produce new versions rather than overwriting an approved artifact.
- Approval records reference immutable IDs and are append-only.
- Jobs reference exact input versions so retries cannot silently use changed inputs.
- Persist enough provenance to reproduce or explain an output, without logging secrets.

---

## 6. Durable task state machine

Use persisted job records with a state machine such as:

`queued → waiting_for_dependencies → ready → running → validating → succeeded`

Other allowed terminal/paused states include `failed`, `cancelled`, `waiting_for_approval`, and `blocked_configuration`.

Requirements:

- Dependency graph and cycle checks.
- Idempotency keys for enqueueing and external side effects.
- Lease/heartbeat or equivalent worker-claim mechanism.
- Bounded retries with backoff for transient failures only.
- Explicit timeout, cancellation, and recovery behavior.
- Persisted attempt count, logs, result references, and error classification.
- Do not retry non-idempotent YouTube side effects blindly; check whether an upload already exists before retrying.
- The UI reads actual job events/status from the API.
- Closing the browser must not cancel valid background work.
- The job queue and worker deployment must be selected and verified for real reliability. A database table alone is not a functioning queue.

---

## 7. Security, privacy, and safety requirements

1. Server-side authentication and tenant authorization on every private operation.
2. No secret values in the repo, frontend bundle, localStorage, URLs, or logs.
3. CSRF protection, strict origin checks where applicable, secure cookies, and safe cache headers.
4. Input validation and output validation for every AI/provider response.
5. Rate limits and resource limits per tenant.
6. Upload validation, content-type/size restrictions, and safe handling of untrusted files.
7. Signed/authorized asset access; no predictable public access to private customer media.
8. Secret redaction and least-privilege provider/OAuth scopes.
9. Audit logs for security-sensitive operations, approvals, OAuth changes, and publication.
10. Explicit data export/deletion and retention behavior.
11. No public YouTube publication without separate explicit owner approval for the exact artifact.
12. No paid provider fallback under FREE_ONLY.
13. Do not store real customer stories or API keys in test fixtures.
14. Security checks and tenant-isolation tests are release blockers.

---

## 8. Suggested repository structure

Adapt the existing source layout instead of moving files solely to match this example:

```
src/                         React UI retained/adapted from Manhwa Beta
  components/                Story Bible, editors, approval center, onboarding
  pages/                     Dashboard, project, episode, settings, integrations
  lib/api.ts                 typed same-origin API client
worker/
  app.ts                     middleware, CSRF, auth, error handling
  index.ts                   Worker entry point and static SPA
  routes/                    projects, story bible, scripts, assets, jobs, approvals
  providers/                 provider interface and adapters
  scripting/                 prompts, schemas, parsing, versioned generation
  jobs/                      state machine, dependencies, retries, cancellation
  services/                  tenant access, credits, approvals, YouTube
  db.ts                      prepared queries and transaction helpers
migrations/                  ordered SQL migrations
test/                        worker/D1 tests, security and workflow tests
scripts/                     local/deployed verification
docs/
  MASTER_BLUEPRINT.md        this canonical blueprint
  audits/                    implementation evidence
  handoffs/                  next-agent instructions
tasks/                       one task file per implementation task
```

Keep the existing toolchain unless a measured blocker requires a change. Avoid unnecessary dependencies and avoid introducing two package managers without a reason.

---

## 9. Implementation phases and acceptance gates

Tasks must be executed sequentially, one focused task per agent session. The existing Beta task numbers should be reconciled with this plan; do not run an older Firebase task if it conflicts with the chosen architecture.

### Phase 0 — Reconcile and stabilize
1. Verify current Beta branch, pull requests, baseline build, typecheck, lint, and browser behavior.
2. Audit all screens and mark each capability as verified real, partial, demo-only, or absent.
3. Compare original Studio modules, migrations, tests, reports, and handoffs against Beta.
4. Adopt this blueprint as the canonical plan after owner review.
5. Produce a source-to-destination migration matrix with exact files, dependencies, risks, and test evidence.

**Gate:** No production integration work until the source inventory and Beta baseline are documented. No feature is called complete without evidence.

### Phase 1 — Port and stabilize the online foundation
6. Port/adapt Worker + Hono routing and deployment configuration.
7. Port/adapt Freebuff OIDC/session and CSRF/auth middleware; verify tenant isolation.
8. Port/adapt D1 migrations and database access for project, season, episode, character, story bible, and activity records.
9. Replace Beta localStorage-only persistence with authenticated API persistence while preserving/exporting any local projects that matter.
10. Port health/readiness, honest integration status, and the verified test/validation scripts.

**Gate:** Sign-in, CRUD, persistence across devices/sessions, private routes, and cross-tenant isolation verified. Never delete local data silently.

### Phase 2 — Provider gateway and real script production
11. Port provider adapters and real verification calls.
12. Implement task-specific provider/model selection and strict FREE_ONLY behavior.
13. Port script prompt building, schema validation, immutable script versions, and append-only approvals.
14. Connect Beta’s Story Bible and Episode Script Editor to the real API; preserve the visual design.
15. Add credit ledger/reservations for eligible story/script tasks.

**Gate:** Real provider calls are verified only when credentials are configured; absent credentials produce honest blocked states. Tests prove no paid fallback and no secret exposure.

### Phase 3 — Assets, image generation, and continuity
16. Port/adapt R2 asset storage and authorized metadata APIs.
17. Add real image-provider adapter(s) and image validation.
18. Add character reference/continuity workflows and version selection.
19. Wire Approval Center to real image artifacts and approval records.

**Gate:** At least one real or explicitly imported image artifact can be stored, retrieved under authorization, versioned, and approved. No placeholder presented as generated.

### Phase 4 — Narration and video rendering
20. Add voice provider/import adapter and validated audio assets.
21. Deploy external rendering worker and a defined job contract.
22. Assemble real MP4 from approved inputs and validate output.
23. Add video QC, render versioning, captions, and preview UI.

**Gate:** A real playable video is produced and validated from stored assets; failures and retries are observable and honest.

### Phase 5 — Durable orchestration and Director
24. Implement durable jobs, dependencies, idempotency, retries, cancellation, recovery, and worker logs.
25. Implement Director/Showrunner plan versions and task dispatch.
26. Connect specialized agents to persisted tasks and artifact references.
27. Add production activity feed and real analytics.

**Gate:** A job survives browser closure/reload, can recover after worker failure, and cannot mark success without validated outputs. Owner approval gates are respected.

### Phase 6 — Approval and YouTube
28. Complete version-bound approvals for script, images, narration, and final render.
29. Add YouTube OAuth, secure token storage, resumable private/unlisted upload, and processing status.
30. Add separate explicit public-publication confirmation and immutable audit event.
31. Complete reconnect, revocation, quota, and failure handling.

**Gate:** Private/unlisted upload verified with owner credentials in a controlled test. Public release remains disabled unless the exact artifact has a recorded explicit approval.

### Phase 7 — Multi-tenant release readiness
32. Add tenant-isolation, authorization, CSRF, upload, provider, queue, and publication security tests.
33. Test mobile layout, accessibility, loading/error/empty states, and recovery.
34. Review licensing, provider costs, YouTube quotas, retention/deletion, privacy, and customer support.
35. Run full end-to-end rehearsal in a separate preview environment; document exact evidence and rollback plan.

**Gate:** Owner approves the release checklist. No public auto-publishing by default.

---

## 10. Definition of done for every task

Every task must:

- Read this blueprint, the active task, latest handoff, and relevant source files.
- Confirm the current branch and working tree before editing.
- Work on a dedicated task branch; do not commit directly to `main` unless explicitly authorized.
- Scope changes narrowly and preserve unrelated work.
- Never commit secrets or real customer data.
- Run actual available checks and record exact results; label unrun checks as not run.
- Add/update tests for behavior and security where practical.
- Update the task status, implementation report, and handoff.
- Report changed files, commit SHA, commands/results, blockers, known gaps, and the exact next task.
- Stop after the handoff instead of automatically starting the next task.
- Never claim a provider, storage, queue, media artifact, approval, or upload is live without verifiable evidence.

Suggested documentation files:
- `tasks/TASK-XX-....md`
- `docs/audits/TASK-XX-IMPLEMENTATION-REPORT.md`
- `docs/handoffs/TASK-XX-HANDOFF.md`

---

## 11. Repository consolidation and deletion policy

Do **not** delete `Mark56-mn/manhwa-studio` now.

Before any deletion, all of the following must be true:

1. The owner has reviewed and accepted this blueprint.
2. The source-to-destination migration matrix is complete.
3. Required source modules, migrations, tests, deployment notes, and task history are ported or intentionally replaced.
4. The consolidated Beta branch builds and passes its automated test suite.
5. A preview deployment is verified for authentication, data persistence, real script generation when configured, storage, and all completed capabilities.
6. Any useful original Studio data/configuration is exported/backed up; no credentials are copied into git.
7. Production/preview environments and rollback procedure are documented.
8. The owner explicitly confirms deletion.

Until then, keep the source repository read-only as a reference. It is safer to stop active development in it than to delete it.

---

## 12. Immediate next action

The next action is **not** to start adding more AI features. It is to create and review the migration inventory:

| Capability | Manhwa Beta state | Original Studio source | Action |
|---|---|---|---|
| Dark creator UI, onboarding, Story Bible, script editor, Approval Center | Present in UI; individual behavior requires audit | Simpler working studio UI | Preserve Beta UI; connect it to real APIs |
| Auth and sessions | Not verified as live in Beta | Freebuff OIDC server-side session | Port/adapt and test |
| Persistent projects/episodes/characters | Browser localStorage in reviewed Beta code | D1 migrations/API | Port/adapt; preserve/export local projects |
| Script provider gateway | Direct Gemini path removed; real backend not verified in Beta | Provider adapters + verification endpoint | Port/adapt |
| Script generation/versioning/approval | Demo-only/unverified in Beta | Real versioned generation and append-only review decisions | Port/adapt |
| Object storage | Not verified in Beta | R2 asset metadata/API | Port/adapt |
| Durable jobs/Director | Not verified as real in either current Beta UI or source foundation | Planned next phases in original Studio | Implement after foundation |
| Image/voice/video | Not verified as live in Beta | Planned tasks/phases in original Studio | Implement with real adapters/workers |
| YouTube OAuth/publication gate | UI exists; live integration not verified in Beta | Planned tasks/phases in original Studio | Implement later with explicit approval |
| Analytics | Beta has UI; production metrics must be audited | Original Studio has real activity feed | Use database-backed metrics only |

After this inventory, revise the existing Beta task roadmap to match the phases above and remove conflicting/unneeded Firebase tasks. Do not begin two conflicting architecture tracks.

---

## 13. Final product principle

**Keep the best user experience from Manhwa Beta; reuse the strongest verified backend from Manhwa Studio; build the missing production agents and media pipeline as real, tested services; and make every status honest.**

The outcome should be one maintainable repository, one coherent architecture, one durable Story Bible, one auditable production workflow, and one explicit owner-controlled publication gate.

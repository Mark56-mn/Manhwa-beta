# Branch consolidation into main

Owner instruction: merge every branch into `main`.

This report records what was merged, what was already reachable, what was
deliberately left out, and the gates run on the merged tree. Nothing was
deployed, no migration was applied, no secret or OIDC client was changed.

## Verified starting state

- Remote: `origin` = `https://github.com/Mark56-mn/Manhwa-beta.git`
- `origin/main` before this consolidation: `49ed52c` ("fix: replace mock YouTube
  connect/upload flow with honest disconnected state")
- Task 04 tip: `1f9d2a6`; Task 05 tip at merge time: `a8b65bf`
  ("Prove TASK 05 auth, credit and job reliability with tests and an audit")
- Vercel readiness tip: `f0d3503`

## Result

`main` is now the consolidated lineage:

```
49ed52c (old main)
  └─ 905bf57  TASK 01 dual-host feasibility
      └─ 2bbd155  shared foundation (projects API, typed client, replication)
          └─ 3e26b77  TASK 03 auth + tenant hardening
              └─ 1f9d2a6  TASK 04 persistent story generation + credits
                  ├─ de851eb, f0d3503  Vercel-ready frontend + deployment docs
                  ├─ a8b65bf  TASK 05 reliability tests, audit and handoff
                  └─ merge of a8b65bf  (content-neutral; TASK 05 tip joins the line)
                      └─ merge of plan/consolidated-manwha-studio-blueprint
```

The commit that adds this report is the tip of that chain.

## Branches merged (or already reachable)

These are reachable from `main` after the consolidation, with no content
regression:

| Branch | Disposition |
| --- | --- |
| `freebuff/4b0c16221aa6b03ec721e34b`, `origin/project-feedback` | already ancestors (platform sync branches) |
| `task/TASK-01-reconcile-ci` | already ancestor |
| `task/TASK-02-verify-stabilization` | already ancestor |
| `task/TASK-03-mock-state-audit` | already ancestor |
| `task/TASK-04-toolchain-hygiene` | already ancestor |
| `task/TASK-05-quality-gates` | already ancestor |
| `task/TASK-06-cloudflare-foundation` | already ancestor |
| `task/TASK-07-d1-tenancy-foundation` (incl. TASK 12 asset routes) | already ancestor |
| `task/TASK-IMPLEMENT-SHARED-FOUNDATION` | already ancestor |
| `task/TASK-03-AUTH-TENANT-HARDENING` | already ancestor |
| `task/TASK-04-PERSISTENT-STORY-GENERATION` | already ancestor |
| `task/VERCEL-DEPLOYMENT-READINESS` | already ancestor |
| `task/TASK-05-END-TO-END-READINESS` | merged (`a8b65bf`) as a real merge commit |
| `origin/plan/consolidated-manwha-studio-blueprint` (= `pr/3`) | merged: adds `docs/MANHWA-STUDIO-CONSOLIDATED-BLUEPRINT.md`, which the current task files cite as their source of truth |

`task/TASK-05-quality-gates`, `task/TASK-06-cloudflare-foundation` and
`task/TASK-07-d1-tenancy-foundation` share numbering with newer tasks from a
different roadmap; their commits are already in this history, and the newer
TASK 05/06/07 documents are the authoritative ones.

## Branches deliberately not merged

| Branch | Why |
| --- | --- |
| `origin/task/TASK-01-corrective-review` (= `task/TASK-01-corrective-review`) | Merging it regresses the app. Its component and metadata edits are older duplicates of copy that later commits revised, and its DOM tests drive the *current* `App`, which now fetches the backend on mount: the merge produces 11 failing tests including real `socket hang up` network errors. Its global `bunfig.toml` happy-dom preload also replaces Bun's `Request`/`Response` and breaks 58 worker tests. Adapting that suite needs its own task (per-test fetch mocking, no global preload). |
| `origin/plan/manhwa-studio-15-task-roadmap` (= `pr/2`) | A draft plan whose task files are explicitly superseded (Firebase/Firestore architecture; see the reconciliation note in `tasks/TASK-02-finish-task-01-verification.md`). Merging would plant 15 contradictory task specs next to the current ones and conflict on `tasks/TASK-02-finish-task-01-verification.md`. The branch is untouched. |
| `freebuff-base` | The platform's initial cloud-project scaffold root, not a work branch. |

No branch was deleted or rewritten, and no force-push was used.

## Gates on the merged tree

| Gate | Command | Result |
| --- | --- | --- |
| Frozen install | `bun install --frozen-lockfile` | pass, 126 packages, lockfile unchanged |
| Typecheck | `bun run lint` (`tsc --noEmit`) | pass |
| Tests | `bun test` | **275 pass / 0 fail, 18 files, 884 `expect()` calls** |
| Build | `bun run build` (`vite build`) | pass (pre-existing chunk-size advisory only) |
| Whitespace | `git diff --check` | pass |

## Still unverified after the merge

Live sign-in, live Gemini generation, live D1 two-tenant isolation and any
preview or production deployment remain BLOCKED exactly as TASK 05 recorded:
no OIDC client is registered, no `GEMINI_API_KEY`/`GEMINI_MODEL` is configured,
migrations `0002`/`0003` are unapplied to any live database, and nothing was
deployed. See `docs/handoffs/TASK-05-END-TO-END-READINESS-HANDOFF.md`.

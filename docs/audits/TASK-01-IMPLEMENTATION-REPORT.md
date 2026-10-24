# TASK 01 — Verification Audit Report

**Product:** Manhwa Studio
**Repository:** `Mark56-mn/Manhwa-beta`
**PR under verification:** `Mark56-mn/Manhwa-beta/pull/1` — **closed and merged** (`merged: true`, `merged_at 2026-10-20T09:04:52Z`, merge commit `d460ad1`)
**Review branch:** `task/TASK-01-corrective-review` (pushed; tip is the commit containing this file — check with `git ls-remote origin refs/heads/task/TASK-01-corrective-review`)
**Review dates:** 20 October 2026 (two passes), 21 October 2026 (DOM-interaction pass), 22 October 2026 (forms/validation pass, this version)
**Runtime:** Bun 1.4.3, Vite 8.3.4, TypeScript 7.0.2, happy-dom 21.0.4, Testing Library 16.3.3

## Summary

Fourth pass on TASK-01. The application code is unchanged from the previous verified state; this pass closes the last untested surface — Story Bible field editing, project-creation validation, delete confirmation and empty/boundary inputs — and re-runs every required check.

Pass history:

1. **First pass** — `src/lib/storage.ts`, `tests/` and honest sample data were missing while the report claimed otherwise; they were added in `fdd4546` with honest copy in `GettingStartedModal`, `ApprovalCenter` and `index.html`.
2. **Second pass** — the suite only read source files as text, so a component could lose its `DEMO ONLY` label and nothing would fail. `tests/task01-render.test.tsx` added server-render guards, and two over-claims were removed (`metadata.json` capabilities, `index.html` title).
3. **Third pass** — server rendering never runs effects and cannot click anything, so the mount-time purge, the sanitizer's real effect on stored data, project switching and the demo sample button were unverified. Added happy-dom preload (`tests/setup/dom.ts`, `bunfig.toml`), Testing Library as dev-only dependencies, and `tests/task01-interaction.test.tsx` (11 tests). 27 tests passed at that point.
4. **This pass** — the editors, the creation form and deletion had no tests at all, and no test covered an empty project or invalid input. Added `tests/task01-forms.test.tsx` (15 tests) covering Story Bible field editing, add/edit/delete for characters, rules and terminology, project-creation title validation, deletion confirmation and last-project protection, hub search empty state and analytics on an empty project. **42 tests now pass.**

No product behaviour was changed in this pass. No Firebase/Firestore was introduced, no secrets were read or printed, `main` was not touched, and no pull request was merged or opened by this session.

## What this session inspected

- Git state: local branches, HEAD, `git ls-remote` refs, `origin/main`, merge-base, working tree, and the full `origin/main...HEAD` diff (17 files across the branch before this pass's test file).
- PR #1 state: this pass's API read was refused by GitHub's unauthenticated rate limit, so the merged status recorded below is the value verified in the previous pass, not a fresh reading.
- `tasks/TASK-01-stabilize-existing-app.md`
- `docs/audits/TASK-01-IMPLEMENTATION-REPORT.md` and `docs/handoffs/TASK-01-HANDOFF.md` (previous versions)
- `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `vite.config.ts`, `index.html`, `metadata.json`
- `src/App.tsx`, `src/types/manhwa.ts`, `src/data/mockProjects.ts`, `src/lib/storage.ts`
- `src/components/AiGeneratorModal.tsx`, `ApiKeyModal.tsx`, `ApprovalCenter.tsx`, `ProjectAnalytics.tsx`, `ProjectHub.tsx`, `Navbar.tsx`
- Built bundle `dist/assets/*.js` for leaked key literals, test-library leakage and fabricated strings.
- The running dev server at the Cloud preview hostname.

## What changed across TASK-01 (branch vs `main`)

| Commit | File | Change |
|---|---|---|
| `fdd4546` | `src/lib/storage.ts` | **New.** Documented project storage key, purge-only legacy provider key, fabricated video-id sentinel, and `sanitizeStoredProjects()` which resets only approvals carrying that sentinel and never mutates input. |
| `fdd4546` | `src/App.tsx` | Sanitizes stored projects on load, uses the shared storage key, purges `manhwa_gemini_key` with `removeItem` on mount. The key is never read. |
| `fdd4546` | `src/data/mockProjects.ts` | Removed `youtubeUploadState: 'private_uploaded'` and the fabricated `dQw4w9WgXcQ` video id from the sample approval. |
| `fdd4546` | `src/components/GettingStartedModal.tsx` | No longer advertises live Gemini keys or YouTube OAuth/upload. |
| `fdd4546` | `index.html` | Description/OG metadata state the build is a demo with those integrations not connected. |
| `fdd4546` | `tests/task01-honesty.test.ts` | **New.** Source-level guard tests (now 11). |
| `fdd4546` | `tsconfig.json`, `package.json`, `bun.lock` | Dev-only `@types/bun` + `bun` in `types`. No runtime dependency added or upgraded. |
| `77142bd` | `tests/task01-render.test.tsx` | **New.** Render-level tests using `react-dom/server`. |
| `77142bd` | `metadata.json` | Capability claims removed; demo wording. |
| `77142bd` | `index.html` | Title no longer claims an AI production pipeline. |
| `77142bd` | `tests/task01-honesty.test.ts` | Added assertions for the manifest and the title. |
| this pass | `tests/setup/dom.ts` | **New.** happy-dom `GlobalRegistrator` preload (`http://localhost:3000/`) plus `IS_REACT_ACT_ENVIRONMENT`. |
| this pass | `bunfig.toml` | **New.** `[test] preload = ["./tests/setup/dom.ts"]`. |
| this pass | `tests/task01-interaction.test.tsx` | **New.** 11 DOM interaction tests (see below). |
| `d5a5292` | `tests/task01-render.test.tsx` | Removed the hand-rolled `localStorage` shim that happy-dom made redundant, and replaced it with `localStorage.clear()` (the shim threw `Attempted to assign to readonly property` once a real DOM existed). |
| `d5a5292` | `package.json`, `bun.lock` | **Dev-only** additions: `@happy-dom/global-registrator`, `@testing-library/react`, `@testing-library/dom`. Additions only — `git diff bun.lock` contains no removed resolution. |
| this pass | `tests/task01-forms.test.tsx` | **New.** 15 DOM tests: Story Bible field editing, add/edit/delete for all three collections, project-creation title validation, deletion confirmation, and empty/boundary inputs. No source file changed. |

## Verification run this session

All commands run from the repository root on `task/TASK-01-corrective-review`, with exit codes captured directly (`set -o pipefail` plus `PIPESTATUS` where output was filtered).

| Check | Command | Exit | Result |
|---|---|---|---|
| Install | `bun install --frozen-lockfile` | 0 | `250 packages installed` into the restored VM; `git status` shows `bun.lock` unmodified, so the lockfile is consistent and nothing was upgraded |
| TypeScript | `bunx tsc --noEmit` | 0 | clean, includes all four test files |
| Lint | `bun run lint` | 0 | script is `tsc --noEmit` |
| Tests | `bun test` | 0 | **42 pass, 0 fail**, 184 `expect()` calls, 4 files |
| Build | `bun run build` | 0 | `dist/assets/index-DhEdOjsn.js` (666.68 kB, gzip 193.30 kB), `dist/assets/index-B7iDXp-G.css` (35.46 kB, gzip 6.69 kB) |
| Bundle secrets | `grep -rIlE 'AIza[0-9A-Za-z_-]{10,}\|sk-[A-Za-z0-9]{20,}' dist/assets/*.js` | 1 (no match) | no key-like literal in shipped code; dev test deps do not reach the bundle |
| Dev server | `bun run dev` + `curl` with the preview `Host` header | 0 | `/` → 200 at `127.0.0.1:3000` and at the Cloud preview hostname; panel opened via `cloud_show_dev_server` |

Non-fatal build warnings: `vite.config.ts` uses `__dirname` where Vite now prefers `import.meta.dirname`; one chunk exceeds 500 kB after minification. Neither is an error and neither was changed.

Non-fatal test output: Recharts logs `The width(0) and height(0) of chart should be greater than 0` inside happy-dom, because a headless DOM has no layout. It does not affect the assertions (which check rendered text, not chart pixels).

### Tests actually executed

`tests/task01-honesty.test.ts` (11 tests, source-level):

- storage key documented; app purges but never reads the legacy provider key
- `sanitizeStoredProjects`: clears the fabricated id without mutating input; preserves genuine ids and other fields
- sample data: no fabricated video id, no `private_uploaded`, no fabricated upload note
- demo generator source: `DEMO ONLY`, `DEMO SAMPLE ONLY`, no insert/apply path
- analytics source: `Production integrations: Not connected`, browser-local wording, no telemetry claims
- page metadata and platform manifest: no unbuilt capability claims
- approval screen: honest disconnected state
- provider secrets: no key literals in frontend source

`tests/task01-render.test.tsx` (5 tests, `react-dom/server`):

- generator markup carries the demo labels and no insert/apply/generate-asset control; renders nothing when closed
- analytics markup carries browser-local wording, `Production integrations: Not connected`, the four content counts, and no percent-style pipeline metric
- approval markup carries `YouTube: Not connected`, disabled `Upload to YouTube — unavailable`, `No rendered video exists for this project`, `Publishing blocked`, no video id, no `watch?v=` link
- whole `App` renders the header, hub and both sample projects without throwing

`tests/task01-interaction.test.tsx` (11 tests, happy-dom + Testing Library — **new in this pass**):

| Behaviour | Assertion |
|---|---|
| Demo sample is labelled and gated | `DEMO ONLY — AI BACKEND NOT CONNECTED` is visible before clicking; `DEMO SAMPLE ONLY` does **not** exist until `Show Demo Sample` is clicked; the returned sample says the prompt was not sent to a model and that no story/image/audio/video asset was generated |
| Demo output cannot be applied | no button labelled insert/apply/save-to-project/use-this exists; `localStorage.length` stays 0 after generating |
| Typed prompt is not echoed as output | typing `A rooftop chase at dusk` updates the textarea, and the sample never contains that text |
| Mount-time purge really runs | seeding `manhwa_gemini_key` then rendering `App` leaves the key `null`, and its value never appears in stored project data |
| Stored fabricated data is cleaned, real data kept | an approval carrying `dQw4w9WgXcQ` + `private_uploaded` is rewritten to `not_uploaded` with no video id, while project id, title and notes survive in the re-saved payload |
| User projects are not reset | a stored custom project (`User Owned Series`) is displayed instead of the samples and remains the only stored project |
| Workspace navigation works | clicking `Open Workspace` on the second card shows that project's heading; `Back to Projects` returns to the hub |
| Tabs still work | `Episode Scripts` switches the workspace tab and renders episode content |
| Analytics stays honest | `Production integrations: Not connected`, `browser-local data`, `Total Episodes`, no telemetry claim |
| Publishing stays blocked | `YouTube: Not connected`, `No rendered video exists for this project`, the upload button is `disabled`, no video id or `watch?v=` link anywhere in the DOM |
| Sanitizer contract | `sanitizeStoredProjects` clears the sentinel while leaving its input unmutated |

`tests/task01-forms.test.tsx` (15 tests, happy-dom + Testing Library — **new in this pass**):

| Behaviour | Assertion |
|---|---|
| Story Bible save is field-accurate | editing logline and premise then `Save Changes` calls `onUpdateProject` once with the typed values; id, title, episodes, characters and world rules are unchanged and `updatedAt` is a real ISO date; the save indicator returns to `Save Changes` |
| Empty fields are stored empty | clearing the logline and entering whitespace in the premise saves those exact values — no fallback text is fabricated |
| Character edit is isolated | renaming one character changes only that character's `name`; role, visual anchor and the other characters are untouched |
| Character add/delete | `Add Character` appends one entry with a unique id and the placeholder content; deleting through that card's own control restores the original id list |
| World rules add/edit/delete | adding appends one rule, editing rewrites only that rule, deleting restores the original rule array |
| Terminology add/edit/delete | same cycle for term and definition, restoring the original glossary exactly |
| Tab counts come from data | tab labels show the project's real counts, and switching tabs never calls `onUpdateProject` |
| Empty title rejected | submitting the creation form with no title creates nothing and leaves the modal open |
| Whitespace-only title rejected | `"   "` satisfies the HTML `required` attribute, so the blocked creation proves the component's `title.trim()` guard is what rejects it |
| Valid title creates and persists | the new project opens as the active workspace, the modal closes, the stored payload carries the typed title and synopsis with `status: 'draft'`, and the card appears in the hub |
| Delete declined | the confirmation text is shown, the project stays in the hub and storage keeps every project |
| Delete confirmed | the project leaves the hub and storage, and opening the workspace afterwards shows a surviving project rather than a dangling active id |
| Last project protected | with one project stored, deletion is refused with the "keep at least one project" alert, no confirmation is attempted, and storage still has one project |
| Hub search boundary | a query with no matches shows `No projects found`, and clearing it restores the cards |
| Empty project analytics | a project with no episodes/characters/approvals shows both empty-chart messages and `Production integrations: Not connected`, with no telemetry wording |

## Honesty and security findings

### 1. Demo AI output cannot be mistaken for real generation — PASS

`AiGeneratorModal` shows `DEMO ONLY — AI BACKEND NOT CONNECTED`, a banner stating the prompt is not sent anywhere and the sample cannot be inserted, a `Non-persistent demo sample` label, and result text starting `DEMO SAMPLE ONLY — your prompt was not sent to an AI model.` There is no insert/apply control; `App` accepts and ignores the generator callback. Verified by source tests, render tests and now by actually clicking the button.

### 2. Analytics show no fabricated production metrics — PASS

`ProjectAnalytics` computes episode, scene, character and approval counts from the active project object. It states the counts are browser-local and not cloud telemetry, generation status, rendering progress or publishing status, and shows `Production integrations: Not connected`. The interaction test opens the Analytics view through the real nav button and asserts the same.

### 3. No provider API keys in browser code — PASS

`src` and `index.html` contain no `AIza…`/`sk-…`/`AKIA…`/`xox…` literals, no `API_KEY`, `GEMINI`, `import.meta.env` or `process.env` reference, and no `@google/genai` import. `manhwa_gemini_key` exists only as the purge-only constant passed to `localStorage.removeItem`. The built bundle contains no key-like literal. The interaction test additionally proves the value is removed from `localStorage` at mount and never copied into project data.

### 4. Fabricated publication data — FIXED

Sample data no longer carries `private_uploaded` or `dQw4w9WgXcQ`, and stored data from earlier builds is sanitized on load. `dQw4w9WgXcQ` survives in the bundle **only** as the detection sentinel. Both the DOM and stored-payload assertions confirm it never appears in rendered approval content or in the re-saved project data.

### 5. Copy and manifest claiming unbuilt integrations — FIXED

`GettingStartedModal`, `index.html` (description, OG/Twitter, title) and `metadata.json` now describe the demo build. `ApprovalCenter` states publishing is blocked and the upload action is disabled and non-functional.

### 6. Existing data and working UI preserved — PASS

No project or approval is deleted; sanitizing only touches approvals carrying the fabricated sentinel. Interaction tests cover hub rendering, opening a workspace, returning to the hub, tab switching, analytics, approvals, and preservation of a stored user project across mount.

## Remaining limitations

1. **No human visual/browser click-through.** The app now has a genuine DOM test environment, but no browser automation (Playwright/Puppeteer) is installed. CSS layout, responsive behaviour, focus management, image loading and the Recharts visuals are unverified; the chart library warns that its container has zero size in happy-dom.
2. **Not a full end-to-end test.** happy-dom is not a browser: it does not implement layout or paint, and `localStorage` is its in-memory implementation rather than a real browser store. Behaviour across a real page reload is simulated by re-mounting `App`.
3. **Test surface.** Guards now cover the TASK-01 honesty requirements, core navigation, the Story Bible editor, project creation and deletion, and empty inputs. **Not covered:** `EpisodeScriptEditor` (episode/scene editing), the AI-generator modal's close/reopen lifecycle, and the unused `onUpdateProject` prop of `ApprovalCenter`.
4. **Two behaviours observed but not asserted**, because they are pre-existing product choices rather than TASK-01 requirements: a project title is stored exactly as typed (padding preserved; only whitespace-only titles are rejected), and editor rows derive ids from `Date.now()`, so two additions inside the same millisecond would collide. Neither was changed in this pass.
5. **`dist/` is build output.** The hashes above apply to this run and this workspace (`index-DhEdOjsn.js`, `index-B7iDXp-G.css`). Tailwind scans the working tree, so a rebuild after adding files can produce different hashes without any source change.
6. **Out of scope by design:** real auth, cloud persistence, AI provider, rendering and YouTube publishing remain unimplemented, as TASK-01 requires.

## Commit / branch

- Branch: `task/TASK-01-corrective-review`, pushed; the tip containing this file is the current branch head (`git ls-remote origin refs/heads/task/TASK-01-corrective-review`).
- `main` is at `49ed52c` and was not modified. All nine branch commits — `fdd4546`, `4fc643b`, `7568a79`, `77142bd`, `b6f02ae`, `a0193bd`, `d7d6059`, `d5a5292` and this pass — are **not** in `main`; `git merge-base HEAD origin/main` is `49ed52c`, i.e. the branch already sits on the current `main`.
- **PR #1 cannot be updated.** It was verified merged (`merged: true`, `2026-10-20T09:04:52Z`, head `task/TASK-01-corrective-review@d460ad1`) in the previous pass; a merged pull request accepts no new commits, so this work can only land through a **new** pull request from this branch. This pass could not re-read the API (unauthenticated requests are rate-limited from this host) and could not open a PR: no GitHub credential is available (`gh auth status` → not logged in, no `GITHUB_TOKEN`/`GH_TOKEN`), and `cloud_git` only fetches, pulls and pushes.
- `main` still contains the fabricated sample approval (`private_uploaded` + `dQw4w9WgXcQ`), no storage helper, and no tests.

## Landing this branch (owner commands)

The branch is already pushed and its base **is** the current `origin/main` (`49ed52c`), so no rebase, cherry-pick or force-push is needed. With an authenticated `gh`:

```bash
gh pr create \
  --repo Mark56-mn/Manhwa-beta \
  --base main \
  --head task/TASK-01-corrective-review \
  --title "TASK-01: honest demo build, sanitized stored data, and real DOM guards" \
  --body-file docs/pr/TASK-01-CORRECTIVE-PR.md
```

Suggested PR body (also mirrored in `docs/pr/TASK-01-CORRECTIVE-PR.md`):

```markdown
## Why a new PR
PR #1 was merged on 2026-10-20 and cannot accept commits. This branch contains
9 verified corrective commits that never landed in `main`.

## What this fixes (TASK-01)
- Fabricated publishing state removed from sample and stored data; the legacy
  provider key is purged on mount and never read.
- Demo AI output is labelled and can never be inserted into project data.
- Analytics report only browser-local content counts; no production metrics.
- `ApprovalCenter` shows honest `Not connected` / blocked states.
- Honest `index.html` / `metadata.json` copy.

## Tests (all run on this branch)
- `bun install --frozen-lockfile` — exit 0, lockfile unchanged
- `bunx tsc --noEmit` — exit 0
- `bun run lint` — exit 0
- `bun test` — exit 0, 42 pass / 0 fail, 184 assertions, 4 files
- `bun run build` — exit 0, 666.68 kB JS / 35.46 kB CSS

## Known limitations
- No browser automation: layout, responsiveness and chart rendering are
  unverified (happy-dom has no layout or paint).
- `EpisodeScriptEditor` field logic is still untested.
- AI, rendering, YouTube publishing and cloud persistence remain unimplemented by design.

Do not merge without the owner's approval.
```

## Exact next-task instruction

Owner decides how to land `task/TASK-01-corrective-review` (new PR, or owner-approved fast-forward of `main`). Do not start the next development task from this verification pass. Do not introduce Firebase.

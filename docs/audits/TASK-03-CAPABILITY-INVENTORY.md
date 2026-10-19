# TASK 03 — Capability Inventory

**Product:** Manhwa Studio · **Repository:** `Mark56-mn/Manhwa-beta`
**Branch:** `task/TASK-03-mock-state-audit` · **Date:** 19 October 2026
**Method:** full-source search of `src/` + `index.html` for mock data, `setTimeout` fake jobs, placeholder
generation, hard-coded success, fake telemetry, and disconnected integrations presented as connected;
cross-checked against the production bundle. **There are no `fetch`/`XMLHttpRequest` calls anywhere in the
application** — the frontend performs zero network requests.

**Status legend:** Working · Partial · Demo-only · Disconnected · Broken · Not implemented

## Inventory

| # | Capability | Status | Evidence / notes |
|---|---|---|---|
| 1 | Project create / open / edit / delete | **Working** | `App.tsx` state → `localStorage["manhwa_studio_projects"]`; delete keeps ≥1 project. Local-only by design (labeled in Navbar badge). |
| 2 | Project search & genre filter | **Working** | `ProjectHub.tsx`, pure client-side filter. |
| 3 | Story Bible editing (premise, logline, characters, rules, terminology) | **Working** | `StoryBibleEditor.tsx`; "Saved!" reflects a real write (600 ms cosmetic delay only). |
| 4 | Episode / scene script editing | **Working** | `EpisodeScriptEditor.tsx`. |
| 5 | Script export to Markdown | **Working** | Blob download, no network. |
| 6 | Analytics charts | **Working (local counts only)** | `ProjectAnalytics.tsx`; counts computed from current project data; explicit "Production integrations: Not connected" notice; no pipeline percentages or telemetry claims (fixed in PR #1, re-verified here). |
| 7 | Reload persistence | **Partial** | Browser-local only; no cloud sync, no multi-device access. Navbar shows `[Local Storage - Demo Mode]`. |
| 8 | Preloaded sample projects | **Demo-only** | `mockProjects.ts`; identified as samples in Getting Started; seed approval no longer claims a fake upload (fixed in this task). |
| 9 | AI generator modal | **Demo-only** | Fixed sample text, prompt not sent anywhere, no insert path; clearly labeled (PR #1 + TASK 02). |
| 10 | AI buttons: Expand Premise / Assist Script / Enhance Prompt | **Demo-only** | Open the labeled demo modal; callbacks are inert. Labels now carry "(Demo)" (fixed in this task). |
| 11 | AI provider calls (Gemini/any) | **Not implemented** | No network calls exist; `@google/genai` declared but never imported. |
| 12 | YouTube OAuth connect | **Not implemented** | Was faked with `setTimeout` → now an explicit "YouTube: Not connected" badge; fake handler deleted (fixed in this task). |
| 13 | YouTube upload / publish (private, unlisted, public) | **Not implemented** | Was faking "Successfully uploaded via YouTube Data API v3" with a hardcoded video ID → replaced with a blocked-state panel + disabled, clearly-labeled button (fixed in this task). |
| 14 | Public-release approval gate | **Not implemented** | UI gate removed with the fake wizard; must be rebuilt server-side (blueprint TASK 16). |
| 15 | Video rendering / QC | **Not implemented** | Was claiming "02:45 · 1080p 60FPS · Audio Track Synchronized" over a cover image → now an honest empty state (fixed in this task). |
| 16 | Approval records (local) | **Partial** | Records stored and displayed from local data; no server verification, no version hashes, no audit trail. |
| 17 | Authentication / multi-tenant isolation | **Not implemented** | No backend; blueprint Phase 1 (TASK 06–07). |
| 18 | Cloud database / object storage | **Not implemented** | No D1/R2/Supabase code exists. |
| 19 | Credits / usage ledger | **Not implemented** | No credit accounting exists anywhere. |
| 20 | Image / voice generation | **Not implemented** | No adapters, no assets pipeline. |
| 21 | Director/agent orchestration, durable jobs | **Not implemented** | No job model; UI view states only. |
| 22 | Automated tests / CI | **Not implemented** | No `test` script, no CI config (blueprint TASK 05). |
| 23 | Deployment configuration | **Not implemented** | No deploy files in the repo; hosting not verified. |
| 24 | Getting Started guide & page metadata | **Working (after this task)** | Copy updated: AI generation, rendering, and publishing explicitly "not connected in this build". |
| 25 | Legacy stored fake publication fields | **Working (after this task)** | Load-time sanitizer resets only approvals containing the known fabricated video ID; no other data touched. |

## Findings fixed in TASK 03 (with locations)

| ID | Finding | Fix |
|---|---|---|
| F1 | Fake YouTube OAuth (`setTimeout` → "YouTube Connected (@StudioCreator)") | Deleted; static "YouTube: Not connected" badge (`ApprovalCenter.tsx`). |
| F2 | Fake upload record "Successfully uploaded via YouTube Data API v3" + hardcoded video ID persisted into project data | Handler deleted; upload button disabled with blocked-state panel (`ApprovalCenter.tsx`). |
| F3 | Fake rendered-video claims (duration/resolution/audio over a cover image) | Honest empty state: "No rendered video exists for this project" (`ApprovalCenter.tsx`). |
| F4 | Seed approval claimed `private_uploaded` + fake video ID | Seed now `not_uploaded`, no video ID (`mockProjects.ts`); load-time sanitizer for existing stored copies (`App.tsx`). |
| F5 | Getting Started described the YouTube workflow in present tense | Reworded to "not connected in this build" (`GettingStartedModal.tsx`). |
| F6 | `index.html` meta claimed "AI-powered … secure YouTube publishing" | Honest description (`index.html`). |
| F7 | AI buttons implied working features | Labels now "(Demo)" (`StoryBibleEditor.tsx`, `EpisodeScriptEditor.tsx`). |
| F10 | Overclaiming intro/hero copy ("AI-powered production pipeline", "prepare video assets for secure publication") | Reworded (`GettingStartedModal.tsx`, `ProjectHub.tsx`). |

## Findings NOT fixed here (deferred by scope)

- **F8** unused dependencies / `react-example` package name → **TASK 04** (toolchain hygiene).
- **F9** `.env.example` AI-Studio variable conventions → **TASK 04**.
- **No tests/CI** → **TASK 05**; the demo-honesty checks in this task are manual greps and should become automated tests there.
- Branding strings ("AI WEBTOON PIPELINE" navbar tag, product title) are treated as product naming, not status claims; revisit at release-gate review.

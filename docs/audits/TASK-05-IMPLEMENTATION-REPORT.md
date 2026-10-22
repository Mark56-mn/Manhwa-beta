# TASK 05 — Implementation Report

**Product:** Manhwa Studio · **Repository:** `Mark56-mn/Manhwa-beta`
**Task:** TASK 05 — Automated quality gates (consolidated blueprint, Phase 0 final task)
**Branch:** `task/TASK-05-quality-gates`
**Branch base:** `5ebe97b` (head of `task/TASK-04-toolchain-hygiene`, which includes the secrets helper) — **dependency:** TASK 04 → TASK 03 → TASK 02 → PR #1, all unmerged. Nothing merged or pushed; `main` untouched.
**Date:** 19 October 2026

**Overall status: PASS** — the repository now has a real, passing test suite wired into `bun run test`,
with mutation evidence that the guards actually fail when violated. CI is **configured but unexecuted** (§7).

> **Reconciled 22 October 2026 (ROADMAP TASK 02).** Everything above records this task's own commit and is
> kept as history. Two statements no longer describe the repository: the total is now **59 tests across
> 5 suites** (repo TASK 07 added `tests/tenancy.test.ts`, TASK 12 added `tests/asset.test.ts`), and there
> is **no CI at all** — the workflow was deleted in ROADMAP TASK 01 (§1). No test from this task was
> removed, skipped or weakened; the suites still pass unmodified.

---

## 1. Scope completed

- [x] Test runner selected: **`bun test`** (Bun's built-in runner — no new runtime/framework dependency; only `@types/bun` added as a devDependency for typechecking).
- [x] `bun run test` script added; 34 tests across 3 suites, all passing.
- [x] Tests for the highest-risk behaviors identified in TASK 02–04 (see §2).
- [x] Quality gate pipeline: install → lint → test → build, all run with recorded exit codes (§6).
- [x] CI workflow added (`.github/workflows/ci.yml`) using free GitHub Actions + `oven-sh/setup-bun` — **explicitly documented as unexecuted until pushed**; a reproducible manual gate is documented in `README.md` in the meantime.
  > **Superseded (ROADMAP TASK 01, 22 October 2026):** this workflow file has been **deleted**. GitHub Actions is no longer part of the validation workflow (the account-level Actions billing lock prevented jobs from ever starting); validation is now the agent-run local gate plus deployment/runtime checks. The local gate commands in this report remain accurate.
- [x] README testing/CI section updated to reflect reality (it previously said no tests existed).

## 2. Test suites

| Suite | Covers |
|---|---|
| `tests/honesty.test.ts` (19 tests) | Scans `src/` + `index.html` and fails if: any banned fake-success string returns (fake OAuth badge, fabricated upload success, demo-insert button, "real-time telemetry", false live-AI claim, fake render spec, overclaiming meta); any `fetch`/`XMLHttpRequest`/`sendBeacon`/`WebSocket` appears; any `localStorage` call uses a non-approved argument or key; the legacy provider key is read/written; the fabricated video ID appears outside its sanitizer module; or a required honest label ("DEMO ONLY", "YouTube: Not connected", "(Demo)", …) disappears. |
| `tests/storage.test.ts` (7 tests) | `sanitizeStoredProjects`: resets only fabricated publication fields, preserves legitimate ones, never mutates input, tolerates malformed stored data missing `approvals`, handles multiple projects independently. |
| `tests/seed-data.test.ts` (8 tests) | Demo seed data: no fabricated video ID, every approval `not_uploaded`, no video IDs at all, unique project IDs, consistent story-bible/episode shape. |

These are the automated form of the manual greps from TASK 02/03 — the honesty rules are now enforced by
`bun run test` instead of by hand.

## 3. Supporting refactor

`sanitizeStoredProjects` and the storage key constants moved from `App.tsx` to **`src/lib/storage.ts`**
(`PROJECTS_STORAGE_KEY`, `LEGACY_PROVIDER_KEY`, `FABRICATED_VIDEO_ID`) so pure logic is importable and
testable; `App.tsx` now imports them (no behavior change — bundle still verified by build).

## 4. Design decisions and trade-offs

1. **`bun test` over Jest/Vitest:** zero new runtime dependencies and it runs TypeScript natively;
   trade-off: component/DOM rendering tests would additionally need `happy-dom` + Testing Library, which
   were **not** added (documented as a possible future addition, not required by the risk list).
2. **Source-scanning honesty tests:** the top product risk per the blueprint is *presentation honesty*
   (fake states reappearing in source), which string-level tests guard directly and cheaply; component
   render tests would not cover metadata or seed data anyway.
3. **`@types/bun` added** (dev-only, +5 lockfile lines, no existing version changed) and referenced via
   `tsconfig.json` `"types": ["vite/client", "bun"]` so `bun:test` typechecks under `tsc --noEmit`.
4. **CI labeled unexecuted:** the workflow cannot run until changes are pushed, so neither README nor this
   report claim CI passes — a reproducible manual gate is documented instead.

## 5. Mutation verification (proof the guards fail when violated)

A probe appended `real-time telemetry` and `localStorage.getItem("evil_key")` to a source file:
`bun run test` → **exit 1** with exactly those two tests failing (named in output); the file was restored
byte-identical (diff-verified) and the clean re-run returned to **exit 0 / 34 pass**. The guards are not
vacuous.

## 6. Commands and actual exit status

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `bun add -d @types/bun` | 0 | `@types/bun@1.4.3`; lockfile diff = 5 added lines only |
| 2 | `bun run test` (first run) | **1** | 2 failures: my localStorage test assumed literal keys still existed after the constants refactor (and one `as Project` cast) — **fixed at the cause**, not skipped (§7) |
| 3 | `bun run lint` (first run) | **1** | `TS2352` on `malformed as Project` in `tests/storage.test.ts` |
| 4 | `bun run test` (after fixes) | **0** | **34 pass / 0 fail**, 55 expect() calls, ~16 ms |
| 5 | `bun run lint` (after fixes) | **0** | no diagnostics (covers tests + src) |
| 6 | `bun run build` | **0** | after the `storage.ts` refactor; same pre-existing >500 kB chunk warning |
| 7 | Mutation probe (§5) | **1 (expected)** | both planted violations detected; restored; clean re-run → 0 |
| 8 | GitHub Actions CI | **NOT RUN — now removed** | workflow added but requires a push; not claimed as passing. Removed in ROADMAP TASK 01 (22 Oct 2026); local gates are the validation path. |

## 7. Failures found and how they were fixed (no assertion was weakened)

- **Test assumed literal localStorage keys:** after extracting `PROJECTS_STORAGE_KEY`/`LEGACY_PROVIDER_KEY`,
  the app legitimately calls `localStorage.getItem(PROJECTS_STORAGE_KEY)` with *constants*, so "every key
  must be a literal" was wrong. Rewrote the test to validate **call-site arguments** (approved constants
  or allow-listed literals only) — which is stronger: it also rejects dynamic keys.
- **TS2352 cast:** changed to `as unknown as Project` with the explanatory comment — the test deliberately
  feeds malformed (pre-schema) stored data, which is real behavior worth covering.

## 8. Security / integrations

- No secrets involved or printed; tests now *enforce* "no network calls in frontend source" and
  "constrained localStorage keys" permanently.
- Auth/tenant/cloud integrations: still not implemented (Phase 1) — nothing here claims otherwise.

## 9. Known limitations / risks

- ~~CI is configured but unexecuted~~ — **superseded**: the workflow was deleted in ROADMAP TASK 01 and hosted CI is not part of this project's validation. The correct current statement is "no CI exists; the local gate is the evidence".
- No DOM/component tests, no browser E2E (no browser automation in this VM); UI honesty is guarded at
  source-string level plus prior manual checks.
- The single mutation probe covers two guard classes; other guards were verified by construction and by
  the passing/failing history above, not by exhaustive mutation.

## 10. Migrations / rollback

No database/storage migrations. Rollback: `git revert` this task's commit; `bun install` restores the
previous dependency set. User data untouched.

## 11. Status

**PASS** for TASK 05's defined scope: `bun run test` exists and passes (exit 0), the gate chain
install → lint → test → build is reproducible from `README.md`. (CI was later deleted in ROADMAP TASK 01 —
see the note at the top of this report.) **Phase 0 is now complete** (exit gate: stable UI, documented capabilities, truthful
build/test evidence, secret handling reviewed).

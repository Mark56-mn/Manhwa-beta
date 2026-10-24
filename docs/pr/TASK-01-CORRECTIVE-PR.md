# TASK-01 corrective PR (draft body)

Use this file with `gh pr create --body-file docs/pr/TASK-01-CORRECTIVE-PR.md`.

---

## Why a new PR

PR #1 was merged on 2026-10-20 and cannot accept commits. This branch contains 9
verified corrective commits that never landed in `main`.

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

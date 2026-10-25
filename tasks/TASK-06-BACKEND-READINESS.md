# TASK 06 — Backend Readiness and Frontend Integration

Scope:
- Independently verify the live frontend and the live backend before relying on any
  earlier report.
- Keep the single existing Cloudflare Worker API and the single existing frontend API
  client; fix verified gaps instead of building a second backend.
- Make the frontend↔API contract explicit and honest (connected / connecting /
  unavailable / authentication required / request failed), with no fake success.
- Prove what is deployed, what is reachable, and what is only true locally.
- Do **not** deploy a Worker, merge a pull request, apply a live migration, register or
  change the production OIDC client, change production variables, or spend money.

Branch: `task/TASK-06-BACKEND-READINESS`
Base: `main` = `d0eba90` (consolidation commit)

## Acceptance criteria

- [x] Live frontend inspected: URL, build artefacts, headers, SPA routing, inlined configuration.
- [x] Live backend inspected: URL, `/healthz`, `/readyz`, `/api/v1/me`, `/api/v1/projects`, preflight.
- [x] `VITE_API_BASE_URL` confirmed as the existing frontend setting and verified as the only
      build-time input the API client reads.
- [x] No API URL invented or hardcoded; unset means same-origin, invalid is reported and never guessed.
- [x] Connection states include connecting, connected, backend unavailable, authentication
      required and request failed, each with an explicit retry or remedy.
- [x] The app still builds and deploys with no backend URL configured.
- [x] No secret is reachable through a `VITE_` variable or present in the built bundle.
- [x] Readiness verified to report missing bindings and configuration without exposing values.
- [x] CORS verified against the real Worker code for a cross-origin frontend origin.
- [x] Deployment verifier can name the two failures found in production (stale Worker routes,
      frontend built without an API origin), proven by tests and by the live run.
- [x] Automated tests added for API client errors, health/readiness responses, CORS and
      missing configuration; mocked, local and live results reported separately.
- [x] No AI-generation success is claimed without the backend accepting the job.
- [x] Project gates run: install, lint, test, build, bundle secret scan, `wrangler deploy --dry-run`.
- [x] Task file, audit report and handoff written; deployment docs reconciled with observed state.
- [x] Changes committed to the task branch only, pushed for review, not merged.

## Required configuration (names only)

Frontend (Vercel, build time, public):
- `VITE_API_BASE_URL`

Worker (public configuration):
- `APP_ORIGIN`
- `ALLOWED_ORIGINS`

Worker (public, from the owner's OIDC registration):
- `FREEBUFF_CLIENT_ID`
- `FREEBUFF_ISSUER`

Worker (secrets):
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secondary backup only, optional today)

Bindings (already declared in `wrangler.toml`):
- `DB` (D1, `manhwa-studio`)
- `FILES` (R2, `manhwa-studio-assets`)

## Out of scope here

Deployment of any kind, live migrations, OIDC registration, production variable changes,
opening or merging a pull request, video rendering and YouTube publishing (still not
implemented by design).

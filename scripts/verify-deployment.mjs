#!/usr/bin/env node
/**
 * Deployment verification for a separately hosted frontend (Vercel) + API.
 *
 * Read-only by design: it performs GET/OPTIONS probes only. It never sends a
 * mutating request, so it cannot write to the database even when the API is
 * misconfigured.
 *
 * Usage:
 *   node scripts/verify-deployment.mjs --api https://api.example --origin https://app.example
 *   node scripts/verify-deployment.mjs --api ... --origin ... --frontend https://app.vercel.app
 *
 * Checks:
 *   1. API liveness             GET  /healthz                  -> 200 JSON
 *   2. API readiness            GET  /readyz                   -> 200 (reports degraded detail)
 *   3. CORS read with a bearer  GET  /api/v1/me + Origin       -> 401 (or an honest 503 auth_not_configured)
 *                                                               + matched Allow-Origin + credentials
 *   4. Credentialed preflight   OPTIONS /api/v1/projects       -> 204 + methods/headers/credentials
 *   5. Foreign origin refused   OPTIONS + GET from an unlisted origin -> no Allow-Origin
 *   6. SPA served               GET  {frontend}/               -> 200 text/html with the app root
 *   7. SPA deep-link fallback   GET  {frontend}/projects/xyz   -> 200 text/html
 *
 * Exit 0 only when every check passed. Exit 2 on bad usage.
 */

const FOREIGN_ORIGIN = 'https://not-allowed.invalid';
const TIMEOUT_MS = 15000;

function parseArgs(argv) {
  const args = { api: '', origin: '', frontend: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith('--')) continue;
    const key = flag.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) continue;
    i += 1;
    if (key in args) args[key] = value;
  }
  return args;
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function readOrigin(value, label) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('bad protocol');
    return url.origin;
  } catch {
    throw new Error(`${label} must be an absolute http(s) origin, got: ${value}`);
  }
}

async function call(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

function jsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name} — ${detail}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.api) {
    console.error('Usage: node scripts/verify-deployment.mjs --api <API origin> [--origin <frontend origin>] [--frontend <deployed frontend URL>]');
    process.exit(2);
  }

  let api;
  let origin = '';
  let frontend = '';
  try {
    api = readOrigin(args.api, '--api');
    if (args.origin) origin = readOrigin(args.origin, '--origin');
    if (args.frontend) frontend = stripTrailingSlash(args.frontend);
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(2);
  }

  console.log(`\nAPI:      ${api}`);
  console.log(`Origin:   ${origin || '(not supplied — CORS checks skipped)'}`);
  console.log(`Frontend: ${frontend || '(not supplied — SPA checks skipped)'}\n`);

  // 1. Liveness
  try {
    const { response, text } = await call(`${api}/healthz`);
    const body = jsonOrNull(text);
    record(
      'API liveness (/healthz)',
      response.status === 200 && body?.status === 'ok',
      `HTTP ${response.status} ${JSON.stringify(body) ?? text.slice(0, 80)}`
    );
  } catch (error) {
    record('API liveness (/healthz)', false, `unreachable: ${error instanceof Error ? error.message : error}`);
  }

  // 2. Readiness
  try {
    const { response, text } = await call(`${api}/readyz`);
    const body = jsonOrNull(text);
    const checks = body && typeof body.checks === 'object' && body.checks !== null ? body.checks : {};
    const summary = Object.entries(checks)
      .map(([key, value]) => `${key}=${value?.status ?? 'unknown'}`)
      .join(' ');
    record(
      'API readiness (/readyz)',
      response.status === 200 && body?.status === 'ready',
      `HTTP ${response.status} ${body?.status ?? text.slice(0, 60)}${summary ? ` (${summary})` : ''}`
    );
  } catch (error) {
    record('API readiness (/readyz)', false, `unreachable: ${error instanceof Error ? error.message : error}`);
  }

  if (origin) {
    // 3. Credentialed cross-origin read must be *answered* with CORS headers.
    //    401 = signed out (Supabase configured). 503 auth_not_configured = no
    //    Supabase project configured yet, which the API states explicitly. Anything else
    //    (200, a 404, an HTML page) means the request did not reach the API.
    try {
      const { response, text } = await call(`${api}/api/v1/me`, { headers: { Origin: origin } });
      const body = jsonOrNull(text);
      const allowOrigin = response.headers.get('access-control-allow-origin');
      const credentials = response.headers.get('access-control-allow-credentials');
      const statusOk =
        response.status === 401 ||
        (response.status === 503 && body?.error === 'auth_not_configured');
      const ok = statusOk && allowOrigin === origin && credentials === 'true';
      record(
        'Credentialed CORS read (/api/v1/me)',
        ok,
        `HTTP ${response.status}${body?.error ? ` ${body.error}` : ''}, allow-origin=${allowOrigin ?? 'absent'}, credentials=${credentials ?? 'absent'}`
      );
    } catch (error) {
      record('Credentialed CORS read (/api/v1/me)', false, `unreachable: ${error instanceof Error ? error.message : error}`);
    }

    // 4. Preflight actually advertised.
    try {
      const { response } = await call(`${api}/api/v1/projects`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type'
        }
      });
      const allowOrigin = response.headers.get('access-control-allow-origin');
      const methods = response.headers.get('access-control-allow-methods') ?? '';
      const allowedHeaders = response.headers.get('access-control-allow-headers') ?? '';
      const credentials = response.headers.get('access-control-allow-credentials');
      // `authorization` must be advertised, or a browser can never send the
      // Supabase access token cross-origin (the preflight fails first).
      const advertisesAuth = /authorization/i.test(allowedHeaders);
      const ok =
        response.status === 204 &&
        allowOrigin === origin &&
        /POST|PUT|PATCH|DELETE/.test(methods) &&
        advertisesAuth &&
        credentials === 'true';
      record(
        'Credentialed preflight (OPTIONS /api/v1/projects)',
        ok,
        `HTTP ${response.status}, allow-origin=${allowOrigin ?? 'absent'}, methods=${methods || 'absent'}, authorization=${advertisesAuth}`
      );
    } catch (error) {
      record('Credentialed preflight (OPTIONS /api/v1/projects)', false, `error: ${error instanceof Error ? error.message : error}`);
    }

    // 5. An unlisted origin must never be echoed back.
    try {
      const { response } = await call(`${api}/api/v1/projects`, {
        method: 'OPTIONS',
        headers: { Origin: FOREIGN_ORIGIN, 'Access-Control-Request-Method': 'POST' }
      });
      const allowOrigin = response.headers.get('access-control-allow-origin');
      record(
        'Foreign origin refused',
        allowOrigin !== FOREIGN_ORIGIN && allowOrigin !== '*',
        `HTTP ${response.status}, allow-origin=${allowOrigin ?? 'absent'}`
      );
    } catch (error) {
      record('Foreign origin refused', false, `error: ${error instanceof Error ? error.message : error}`);
    }
  } else {
    console.log('  [SKIP] CORS checks — pass --origin <the frontend origin> to run them.');
  }

  if (frontend) {
    // 6. The SPA itself is served.
    try {
      const { response, text } = await call(frontend);
      const type = response.headers.get('content-type') ?? '';
      const ok =
        response.status === 200 && type.includes('text/html') && text.includes('id="root"');
      record(
        'Frontend serves the app',
        ok,
        `HTTP ${response.status}, content-type=${type || 'absent'}, root=${text.includes('id="root"')}`
      );
    } catch (error) {
      record('Frontend serves the app', false, `unreachable: ${error instanceof Error ? error.message : error}`);
    }

    // 7. Deep links fall back to index.html instead of a host 404.
    try {
      const { response, text } = await call(`${frontend}/projects/deep-link-check`);
      const type = response.headers.get('content-type') ?? '';
      const ok = response.status === 200 && type.includes('text/html') && text.includes('id="root"');
      record(
        'SPA deep-link fallback',
        ok,
        `HTTP ${response.status}, content-type=${type || 'absent'}`
      );
    } catch (error) {
      record('SPA deep-link fallback', false, `unreachable: ${error instanceof Error ? error.message : error}`);
    }
  } else {
    console.log('  [SKIP] SPA checks — pass --frontend <deployed URL> to run them.');
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log('Failed checks:');
    for (const result of failed) console.log(`  - ${result.name}: ${result.detail}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

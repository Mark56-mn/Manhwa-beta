import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

/**
 * Deployment verifier behaviour (TASK 06).
 *
 * The verifier is the tool that decides whether a frontend/API pair may be
 * called "verified". These tests run the real script against two local HTTP
 * servers, so a stale API or a frontend built without VITE_API_BASE_URL must
 * fail with a specific message — the two conditions observed on the live
 * deployment on 25 October 2026.
 */

const SCRIPT = join(import.meta.dir, '..', 'scripts', 'verify-deployment.mjs');
const ALLOWED_ORIGIN = 'https://frontend.example';

const CORS = {
  'access-control-allow-origin': ALLOWED_ORIGIN,
  'access-control-allow-credentials': 'true'
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

interface PairOptions {
  /** A Worker that predates the projects API: no CORS, 404 for newer routes. */
  staleApi?: boolean;
  /** A static build made without VITE_API_BASE_URL. */
  bundleWithoutApiOrigin?: boolean;
}

async function runVerifier(api: string, frontend: string) {
  const proc = Bun.spawn(
    [
      process.execPath,
      SCRIPT,
      '--api',
      api,
      '--origin',
      ALLOWED_ORIGIN,
      '--frontend',
      frontend
    ],
    { stdout: 'pipe', stderr: 'pipe' }
  );
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { code: await proc.exited, stdout, stderr };
}

async function withPair(options: PairOptions, body: (api: string, frontend: string) => Promise<void>) {
  const api = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const origin = request.headers.get('origin');
      const stale = options.staleApi === true;
      // The observed stale build sent no CORS headers at all.
      const cors = !stale && origin === ALLOWED_ORIGIN ? CORS : {};

      if (request.method === 'OPTIONS') {
        if (stale) return new Response('Not Found', { status: 404 });
        if (origin !== ALLOWED_ORIGIN) return new Response('forbidden', { status: 403 });
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            'access-control-allow-methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
            'access-control-allow-headers': 'Content-Type'
          }
        });
      }

      if (url.pathname === '/') {
        return json({ service: 'manhwa-studio-api', status: 'ok', phase: 'test build' });
      }
      if (url.pathname === '/healthz') return json({ status: 'ok' }, 200, cors);
      if (url.pathname === '/readyz') {
        return json({ status: 'ready', checks: { d1: { status: 'ok' } } }, 200, cors);
      }
      if (url.pathname === '/api/v1/me') return json({ error: 'unauthorized' }, 401, cors);
      if (url.pathname === '/api/v1/projects') {
        if (stale) return new Response('Not Found', { status: 404 });
        return json({ error: 'unauthorized' }, 401, cors);
      }
      return new Response('Not Found', { status: 404 });
    }
  });

  const apiOrigin = `http://127.0.0.1:${api.port}`;
  const bundle = options.bundleWithoutApiOrigin
    ? 'console.log("built without an API origin")'
    : `const API = "${apiOrigin}"; console.log(API);`;

  const frontendServer = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js')) {
        return new Response(bundle, {
          headers: { 'content-type': 'text/javascript' }
        });
      }
      return new Response(
        '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-test.js"></script></head><body><div id="root"></div></body></html>',
        { headers: { 'content-type': 'text/html; charset=utf-8' } }
      );
    }
  });

  const frontendOrigin = `http://127.0.0.1:${frontendServer.port}`;
  try {
    await body(apiOrigin, frontendOrigin);
  } finally {
    api.stop(true);
    frontendServer.stop(true);
  }
}

describe('the verifier accepts a correctly deployed pair', () => {
  it('passes every check when the API serves the routes and the bundle carries its origin', async () => {
    await withPair({}, async (api, frontend) => {
      const result = await runVerifier(api, frontend);
      expect(result.stdout).toContain('API serves the shared routes (/api/v1/projects)');
      expect(result.stdout).toContain('Frontend build targets the API origin');
      expect(result.stdout).toContain('9/9 checks passed.');
      expect(result.code).toBe(0);
    });
  });
});

describe('the verifier names a stale API deployment', () => {
  it('fails when /api/v1/projects is not served and no CORS headers are sent', async () => {
    await withPair({ staleApi: true }, async (api, frontend) => {
      const result = await runVerifier(api, frontend);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[FAIL] API serves the shared routes (/api/v1/projects)');
      expect(result.stdout).toContain('does not serve /api/v1/projects');
      expect(result.stdout).toContain('[FAIL] Credentialed CORS read (/api/v1/me)');
      // Liveness and readiness still pass — which is exactly why the route
      // check exists: a stale deployment looks alive.
      expect(result.stdout).toContain('[PASS] API liveness (/healthz)');
      expect(result.stdout).toContain('[PASS] API readiness (/readyz)');
    });
  });
});

describe('the verifier names a frontend built without an API origin', () => {
  it('fails when the deployed bundle does not contain the API origin', async () => {
    await withPair({ bundleWithoutApiOrigin: true }, async (api, frontend) => {
      const result = await runVerifier(api, frontend);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[FAIL] Frontend build targets the API origin');
      expect(result.stdout).toContain('absent from 1 deployed bundle(s)');
      expect(result.stdout).toContain('VITE_API_BASE_URL');
      expect(result.stdout).toContain('8/9 checks passed.');
    });
  });
});

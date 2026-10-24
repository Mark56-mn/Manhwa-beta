import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  INVALID_API_BASE_URL_HINT,
  MISSING_API_BASE_URL_HINT,
  resolveApiConfig
} from '../src/lib/apiConfig';
import { ApiError, createApiClient, type FetchLike } from '../src/lib/api';
import { loadCloudWorkspace } from '../src/lib/cloudWorkspace';

/**
 * Vercel deployment readiness (TASK-VERCEL-DEPLOYMENT-READINESS).
 *
 * These tests hold the deployment configuration and the API-client diagnostics
 * to explicit shapes, so a static host can never be deployed "successfully"
 * while the application is silently pointed at nothing.
 */

const ROOT = join(import.meta.dir, '..');

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as T;
}

describe('vercel.json', () => {
  const config = readJson<{
    framework?: string;
    installCommand?: string;
    buildCommand?: string;
    outputDirectory?: string;
    rewrites?: Array<{ source: string; destination: string }>;
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  }>('vercel.json');

  test('pins the framework and the committed output directory', () => {
    expect(config.framework).toBe('vite');
    expect(config.outputDirectory).toBe('dist');
  });

  test('installs from the committed lockfile, never a floating resolve', () => {
    expect(config.installCommand).toContain('bun install');
    expect(config.installCommand).toContain('--frozen-lockfile');
  });

  test('builds through the project script', () => {
    const pkg = readJson<{ scripts: Record<string, string> }>('package.json');
    expect(config.buildCommand).toBe('bun run build');
    expect(pkg.scripts.build).toBe('vite build');
  });

  test('serves index.html for deep links', () => {
    const rewrite = config.rewrites?.find((r) => r.destination === '/index.html');
    expect(rewrite).toBeDefined();
    expect(rewrite?.source).toBe('/(.*)');
  });

  test('sets the security headers the SPA relies on', () => {
    const all = (config.headers ?? []).flatMap((h) => h.headers);
    const keys = all.map((h) => h.key.toLowerCase());
    expect(keys).toContain('x-content-type-options');
    expect(keys).toContain('referrer-policy');
  });
});

describe('.env.example documents the deployment contract', () => {
  const text = readFileSync(join(ROOT, '.env.example'), 'utf8');

  test('documents the single public frontend variable', () => {
    expect(text).toContain('VITE_API_BASE_URL');
    expect(text).toContain('ALLOWED_ORIGINS');
  });

  test('no secret-looking name is exposed through a VITE_ variable', () => {
    const exposed = text
      .split('\n')
      .filter((line) => /^\s*VITE_[A-Z0-9_]*\s*=/.test(line))
      .filter((line) => /(KEY|SECRET|TOKEN|PASSWORD|DATABASE|SERVICE_ROLE)/i.test(line));
    expect(exposed).toEqual([]);
  });
});

describe('VITE_API_BASE_URL resolution', () => {
  test('unset or empty means same-origin', () => {
    expect(resolveApiConfig('')).toEqual({ kind: 'same-origin', baseUrl: '' });
    expect(resolveApiConfig('   ')).toEqual({ kind: 'same-origin', baseUrl: '' });
  });

  test('a bare origin is accepted and normalized', () => {
    expect(resolveApiConfig('https://api.example.test')).toEqual({
      kind: 'configured',
      baseUrl: 'https://api.example.test'
    });
    expect(resolveApiConfig('https://api.example.test/')).toEqual({
      kind: 'configured',
      baseUrl: 'https://api.example.test'
    });
  });

  test('values the client cannot use are reported, never guessed', () => {
    for (const raw of [
      'api.example.test',
      'https://api.example.test/api',
      'https://api.example.test?x=1',
      'ftp://api.example.test',
      'https://user:pass@api.example.test'
    ]) {
      expect(resolveApiConfig(raw).kind).toBe('invalid');
    }
  });
});

describe('the API client never invents a working backend', () => {
  const okJson: FetchLike = async () =>
    new Response(JSON.stringify({ sub: 'user-1', name: 'Tester' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });

  test('an invalid configured value fails every call with a configuration error', async () => {
    const client = createApiClient({ baseUrl: 'api.example.test', fetchImpl: okJson });
    const error = await client.getSession().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('api_not_configured');
    expect((error as ApiError).message).toBe(INVALID_API_BASE_URL_HINT);
  });

  test('same-origin HTML (a static host SPA fallback) is diagnosed as missing configuration', async () => {
    const html: FetchLike = async () =>
      new Response('<!doctype html><html><body>app</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    const client = createApiClient({ baseUrl: '', fetchImpl: html });
    const error = await client.getSession().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('api_not_configured');
    expect((error as ApiError).message).toBe(MISSING_API_BASE_URL_HINT);
  });

  test('configured origin + HTML answer stays an invalid response, not a config claim', async () => {
    const html: FetchLike = async () =>
      new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: html });
    const error = await client.getSession().catch((e: unknown) => e);
    expect((error as ApiError).kind).toBe('invalid_response');
  });

  test('a host outage page is surfaced instead of a bare status code', async () => {
    const outage: FetchLike = async () =>
      new Response('Site temporarily unavailable', {
        status: 503,
        headers: { 'content-type': 'text/plain' }
      });
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: outage });
    const error = await client.getSession().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
    expect((error as ApiError).message).toContain('Site temporarily unavailable');
  });

  test('the workspace shows a misconfiguration, not "signed out"', async () => {
    const html: FetchLike = async () =>
      new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const state = await loadCloudWorkspace(createApiClient({ baseUrl: '', fetchImpl: html }));
    expect(state.status).toBe('api_misconfigured');
    if (state.status === 'api_misconfigured') {
      expect(state.detail).toBe(MISSING_API_BASE_URL_HINT);
    }
  });
});

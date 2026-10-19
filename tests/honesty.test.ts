import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LEGACY_PROVIDER_KEY, PROJECTS_STORAGE_KEY } from '../src/lib/storage';

/**
 * Source-level honesty guards.
 *
 * These tests scan the actual application source (src/ + index.html) and fail
 * if a fake-success string, a network call, or an unapproved localStorage key
 * is ever reintroduced. They are the automated version of the manual greps
 * from TASK 02/03. Test files themselves are not scanned.
 */

const ROOT = join(import.meta.dir, '..');

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSourceFiles(full, out);
    else if (/\.(ts|tsx|html)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = [...collectSourceFiles(join(ROOT, 'src')), join(ROOT, 'index.html')];
const sources = files.map((path) => ({
  path,
  rel: relative(ROOT, path).replaceAll('\\', '/'),
  text: readFileSync(path, 'utf8'),
}));

describe('no fake-success strings in application source', () => {
  const banned: Array<{ phrase: string; reason: string }> = [
    { phrase: 'YouTube Connected (@StudioCreator)', reason: 'fake OAuth connected badge' },
    { phrase: 'Successfully uploaded via YouTube Data API v3', reason: 'fabricated upload success' },
    { phrase: 'Accept & Insert into Project', reason: 'demo sample insertion path' },
    { phrase: 'real-time telemetry', reason: 'fabricated telemetry claim' },
    { phrase: 'Fully supports Sandbox mode or live Gemini API keys', reason: 'false live-AI claim' },
    { phrase: 'Duration: 02:45', reason: 'fake rendered-video specification' },
    { phrase: 'AI-powered webtoon production studio', reason: 'overclaiming metadata' },
  ];

  for (const { phrase, reason } of banned) {
    test(`absent: "${phrase}" — ${reason}`, () => {
      const hits = sources.filter((s) => s.text.includes(phrase)).map((s) => s.rel);
      expect(hits).toEqual([]);
    });
  }
});

describe('the fabricated sample video ID is contained', () => {
  test('appears only in the sanitizer module that removes it', () => {
    const hits = sources.filter((s) => s.text.includes('dQw4w9WgXcQ')).map((s) => s.rel);
    expect(hits).toEqual(['src/lib/storage.ts']);
  });
});

describe('application source performs no network calls', () => {
  const patterns = [/\bfetch\s*\(/, /XMLHttpRequest/, /navigator\.sendBeacon/, /new WebSocket\s*\(/];
  for (const pattern of patterns) {
    test(`no match for ${pattern.source}`, () => {
      const hits = sources.filter((s) => pattern.test(s.text)).map((s) => s.rel);
      expect(hits).toEqual([]);
    });
  }
});

describe('required honest labels are present', () => {
  const required: Array<[phrase: string, rel: string]> = [
    ['DEMO ONLY', 'src/components/AiGeneratorModal.tsx'],
    ['YouTube: Not connected', 'src/components/ApprovalCenter.tsx'],
    ['No rendered video exists', 'src/components/ApprovalCenter.tsx'],
    ['(Demo)', 'src/components/StoryBibleEditor.tsx'],
    ['(Demo)', 'src/components/EpisodeScriptEditor.tsx'],
    ['not connected in this build', 'index.html'],
  ];

  for (const [phrase, rel] of required) {
    test(`present in ${rel}: "${phrase}"`, () => {
      const file = sources.find((s) => s.rel === rel);
      if (!file) throw new Error(`expected file missing: ${rel}`);
      expect(file.text.includes(phrase)).toBe(true);
    });
  }
});

describe('localStorage usage is constrained', () => {
  const ALLOWED_KEYS = new Set(['manhwa_studio_projects', 'manhwa_gemini_key']);
  const APPROVED_ARGS = new Set(['PROJECTS_STORAGE_KEY', 'LEGACY_PROVIDER_KEY']);
  // Captures every localStorage.<method>(<first argument>) call site.
  const CALL = /localStorage\.([a-zA-Z]+)\s*\(\s*([^,)\n]*)/g;
  const QUOTED = /^[`'"](.+)[`'"]$/;

  function callSites(): Array<{ rel: string; method: string; arg: string }> {
    const sites: Array<{ rel: string; method: string; arg: string }> = [];
    for (const s of sources) {
      for (const m of s.text.matchAll(CALL)) {
        sites.push({ rel: s.rel, method: m[1], arg: m[2].trim() });
      }
    }
    return sites;
  }

  test('every localStorage call uses an approved constant or an allow-listed literal', () => {
    const sites = callSites();
    expect(sites.length).toBeGreaterThan(0);

    const bad = sites
      .filter(({ method, arg }) => {
        if (!['getItem', 'setItem', 'removeItem'].includes(method)) return true;
        if (APPROVED_ARGS.has(arg)) return false;
        const quoted = arg.match(QUOTED);
        if (quoted) return !ALLOWED_KEYS.has(quoted[1]);
        return true; // dynamic or unrecognized argument
      })
      .map(({ rel, method, arg }) => `${rel}: ${method}(${arg})`);

    expect(bad).toEqual([]);
  });

  test('the storage key constants are on the allow-list', () => {
    expect(ALLOWED_KEYS.has(PROJECTS_STORAGE_KEY)).toBe(true);
    expect(ALLOWED_KEYS.has(LEGACY_PROVIDER_KEY)).toBe(true);
  });

  test('the legacy provider key is never read or written', () => {
    const legacyArgs = new Set([`LEGACY_PROVIDER_KEY`, `'manhwa_gemini_key'`, '"manhwa_gemini_key"', '`manhwa_gemini_key`']);
    const hits = callSites()
      .filter((c) => legacyArgs.has(c.arg) && c.method !== 'removeItem')
      .map((c) => `${c.rel}: ${c.method}(${c.arg})`);
    expect(hits).toEqual([]);
  });
});

import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static security guards for the AI gateway (TASK 04).
 *
 * These complement the behavioural tests: the provider credential must remain
 * server-side, no AI host may be contacted from browser code, and no key may be
 * persisted in a job/credit record.
 */

const ROOT = join(import.meta.dir, '..');

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(ROOT, directory))) {
    const relative = join(directory, entry);
    const stats = statSync(join(ROOT, relative));
    if (stats.isDirectory()) files.push(...sourceFiles(relative));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(relative);
  }
  return files;
}

describe('AI credentials stay server-side', () => {
  it('never references the provider key or host from browser code', () => {
    for (const file of sourceFiles('src')) {
      const text = read(file);
      expect(text).not.toContain('GEMINI_API_KEY');
      expect(text).not.toContain('x-goog-api-key');
      expect(text).not.toContain('generativelanguage.googleapis.com');
      expect(text).not.toContain('GEMINI_MODEL');
    }
  });

  it('keeps the key out of URLs, logs and persisted job columns', () => {
    const ai = read('worker/src/ai.ts');
    expect(ai).toContain("'x-goog-api-key'");
    expect(ai).not.toMatch(/console\.(log|error|warn)/);
    expect(ai).not.toMatch(/[?&]key=/);

    const migration = read('db/migrations/0003_story_generation.sql');
    expect(migration).not.toMatch(/api_key|credential|secret|token/i);
    expect(migration).toContain('provider');
    expect(migration).toContain('model');
  });

  it('does not accept plan, balance, cost or ownership from a body', () => {
    const story = read('worker/src/story.ts');
    expect(story).not.toMatch(/body\.(balance|plan|cost|organizationId|organization_id|created_by_sub)/);
    expect(story).toMatch(/const cost: number = CREDIT_COSTS\[/);
    expect(story).toMatch(/access\.organizationId/);
  });
});

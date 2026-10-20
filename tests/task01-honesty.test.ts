import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { Project } from '../src/types/manhwa';
import { INITIAL_PROJECTS } from '../src/data/mockProjects';
import {
  FABRICATED_VIDEO_ID,
  LEGACY_PROVIDER_KEY,
  PROJECTS_STORAGE_KEY,
  sanitizeStoredProjects
} from '../src/lib/storage';

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

function projectWithApproval(overrides: Partial<Project['approvals'][number]>): Project {
  const base: Project = structuredClone(INITIAL_PROJECTS[0]);
  base.approvals = [
    {
      id: 'test-approval',
      artifactId: 'ep-1',
      artifactTitle: 'Episode 1: Script & Scenes',
      type: 'script',
      status: 'approved',
      approver: 'Tester',
      timestamp: '2026-01-01 00:00',
      notes: 'test',
      youtubeUploadState: 'not_uploaded',
      ...overrides
    }
  ];
  return base;
}

describe('storage keys', () => {
  test('project data uses a single documented key', () => {
    expect(PROJECTS_STORAGE_KEY).toBe('manhwa_studio_projects');
    expect(LEGACY_PROVIDER_KEY).toBe('manhwa_gemini_key');
  });

  test('app never reads the legacy provider key', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('localStorage.removeItem(LEGACY_PROVIDER_KEY)');
    expect(app).not.toContain('getItem(LEGACY_PROVIDER_KEY)');
  });
});

describe('sanitizeStoredProjects', () => {
  test('clears the fabricated YouTube video id without mutating input', () => {
    const project = projectWithApproval({
      youtubeUploadState: 'private_uploaded',
      youtubeVideoId: FABRICATED_VIDEO_ID
    });
    const [sanitized] = sanitizeStoredProjects([project]);

    expect(sanitized.approvals[0].youtubeVideoId).toBeUndefined();
    expect(sanitized.approvals[0].youtubeUploadState).toBe('not_uploaded');
    // original untouched
    expect(project.approvals[0].youtubeVideoId).toBe(FABRICATED_VIDEO_ID);
    expect(project.approvals[0].youtubeUploadState).toBe('private_uploaded');
  });

  test('leaves other approval data and projects intact', () => {
    const project = projectWithApproval({ youtubeVideoId: 'realVideoId123' });
    const [sanitized] = sanitizeStoredProjects([structuredClone(project)]);

    expect(sanitized.id).toBe(project.id);
    expect(sanitized.approvals[0].youtubeVideoId).toBe('realVideoId123');
    expect(sanitized.approvals[0].notes).toBe('test');
  });
});

describe('demo and sample data honesty', () => {
  test('sample data contains no fabricated upload state', () => {
    const approvals = INITIAL_PROJECTS.flatMap((project) => project.approvals);
    expect(approvals.length).toBeGreaterThan(0);

    for (const approval of approvals) {
      expect(approval.youtubeVideoId).toBeUndefined();
      expect(approval.youtubeUploadState).toBe('not_uploaded');
      expect(approval.notes).not.toContain('Successfully uploaded');
      expect(approval.notes).not.toContain('Approved for storyboard asset rendering');
    }
  });

  test('AI generator is labelled demo-only and cannot apply its sample', () => {
    const modal = read('src/components/AiGeneratorModal.tsx');
    expect(modal).toContain('DEMO ONLY — AI BACKEND NOT CONNECTED');
    expect(modal).toContain('DEMO SAMPLE ONLY');
    expect(modal).not.toContain('onInsert');
    expect(modal).not.toContain('Apply');

    const app = read('src/App.tsx');
    expect(app).toContain('Live AI generation is not connected');
    expect(app).not.toContain('Accept & Insert into Project');
  });

  test('analytics reports local counts and not production metrics', () => {
    const analytics = read('src/components/ProjectAnalytics.tsx');
    expect(analytics).toContain('Production integrations: Not connected');
    expect(analytics).toContain('browser-local data');
    expect(analytics).not.toContain('real-time telemetry');
    expect(analytics).not.toContain('pipeline');
  });

  test('page metadata does not claim unbuilt integrations', () => {
    const html = read('index.html');
    expect(html).not.toContain('secure YouTube publishing');
    expect(html).toContain('not connected');
    // TASK-01 re-check: the document title must not claim a working AI pipeline.
    expect(html).not.toMatch(/<title>[^<]*AI Webtoon Production[^<]*<\/title>/);
  });

  test('platform manifest does not claim unbuilt capabilities', () => {
    const manifest = JSON.parse(read('metadata.json')) as {
      description: string;
      majorCapabilities: string[];
    };

    expect(manifest.description).not.toContain('secure YouTube publishing');
    expect(manifest.description).not.toMatch(/AI-powered/i);
    expect(manifest.description).toContain('not connected');
    expect(manifest.majorCapabilities).toEqual([]);
  });

  test('approval screen reports an honest disconnected publishing state', () => {
    const approvals = read('src/components/ApprovalCenter.tsx');
    expect(approvals).toContain('YouTube: Not connected');
    expect(approvals).toContain('No rendered video exists for this project');
    expect(approvals).not.toContain('Successfully uploaded');
    expect(approvals).not.toContain('YouTube Connected (@');
    expect(approvals).not.toContain(FABRICATED_VIDEO_ID);
  });
});

describe('provider secrets', () => {
  test('no provider key literals in frontend source', () => {
    const files = [
      'src/App.tsx',
      'src/lib/storage.ts',
      'src/components/ApiKeyModal.tsx',
      'src/components/AiGeneratorModal.tsx',
      'src/data/mockProjects.ts'
    ];
    const keyPattern = /AIza[0-9A-Za-z_-]{10,}|sk-[A-Za-z0-9]{20,}/;

    for (const file of files) {
      expect(read(file)).not.toMatch(keyPattern);
    }
  });
});

import { describe, expect, test } from 'bun:test';
import type { ApprovalRecord, Project } from '../src/types/manhwa';
import { FABRICATED_VIDEO_ID, PROJECTS_STORAGE_KEY, sanitizeStoredProjects } from '../src/lib/storage';

function makeApproval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: 'app-1',
    artifactId: 'ep-1',
    artifactTitle: 'Episode 1: Script',
    type: 'script',
    status: 'approved',
    approver: 'Tester',
    timestamp: '2026-10-19 00:00',
    notes: 'note',
    youtubeUploadState: 'not_uploaded',
    ...overrides,
  };
}

function makeProject(approvals: ApprovalRecord[]): Project {
  return {
    id: 'proj-test',
    title: 'Test Series',
    genre: 'Test',
    synopsis: 'synopsis',
    artStyle: 'style',
    status: 'draft',
    updatedAt: '2026-10-19',
    coverImage: '',
    author: 'author',
    targetAudience: 'all',
    storyBible: { premise: '', logline: '', worldRules: [], characters: [], terminology: [] },
    episodes: [],
    approvals,
  };
}

describe('sanitizeStoredProjects', () => {
  test('resets approvals carrying the fabricated video ID', () => {
    const dirty = makeProject([
      makeApproval({
        youtubeUploadState: 'private_uploaded',
        youtubeVideoId: FABRICATED_VIDEO_ID,
      }),
    ]);

    const [clean] = sanitizeStoredProjects([dirty]);
    expect(clean.approvals[0].youtubeUploadState).toBe('not_uploaded');
    expect(clean.approvals[0].youtubeVideoId).toBeUndefined();
  });

  test('preserves approvals with any other video ID untouched', () => {
    const legit = makeApproval({ youtubeUploadState: 'published', youtubeVideoId: 'real-video-1' });
    const [clean] = sanitizeStoredProjects([makeProject([legit])]);
    expect(clean.approvals[0]).toEqual(legit);
  });

  test('does not mutate its input (pure function)', () => {
    const original = makeApproval({
      youtubeUploadState: 'private_uploaded',
      youtubeVideoId: FABRICATED_VIDEO_ID,
    });
    const input = makeProject([original]);

    sanitizeStoredProjects([input]);

    expect(input.approvals[0].youtubeVideoId).toBe(FABRICATED_VIDEO_ID);
    expect(input.approvals[0].youtubeUploadState).toBe('private_uploaded');
  });

  test('leaves unrelated project fields unchanged', () => {
    const input = makeProject([]);
    const [clean] = sanitizeStoredProjects([input]);
    expect(clean).toEqual(input);
  });

  test('tolerates malformed stored data missing the approvals array', () => {
    // Real localStorage data is untyped and may predate the current schema.
    const malformed = { ...makeProject([]) } as unknown as Record<string, unknown>;
    delete malformed.approvals;
    const [clean] = sanitizeStoredProjects([malformed as unknown as Project]);
    expect(clean.approvals).toEqual([]);
  });

  test('sanitizes multiple projects independently', () => {
    const dirty = makeProject([makeApproval({ youtubeVideoId: FABRICATED_VIDEO_ID, youtubeUploadState: 'published' })]);
    dirty.id = 'a';
    const clean = makeProject([makeApproval({ youtubeVideoId: 'keep-me', youtubeUploadState: 'published' })]);
    clean.id = 'b';

    const result = sanitizeStoredProjects([dirty, clean]);
    expect(result[0].approvals[0].youtubeVideoId).toBeUndefined();
    expect(result[1].approvals[0].youtubeVideoId).toBe('keep-me');
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  test('storage key constant matches the app contract', () => {
    expect(PROJECTS_STORAGE_KEY).toBe('manhwa_studio_projects');
  });
});

import { describe, expect, test } from 'bun:test';
import { INITIAL_PROJECTS } from '../src/data/mockProjects';
import { FABRICATED_VIDEO_ID } from '../src/lib/storage';

/**
 * The preloaded demo projects must never claim a publication happened.
 * (An earlier build shipped a seed approval with a fabricated YouTube video ID.)
 */

describe('demo seed data makes no publication claims', () => {
  test('no seed approval carries the fabricated video ID', () => {
    const hits = INITIAL_PROJECTS.flatMap((p) =>
      p.approvals.filter((a) => a.youtubeVideoId === FABRICATED_VIDEO_ID).map((a) => `${p.id}/${a.id}`)
    );
    expect(hits).toEqual([]);
  });

  test('every seed approval reports "not_uploaded"', () => {
    const wrong = INITIAL_PROJECTS.flatMap((p) =>
      p.approvals
        .filter((a) => a.youtubeUploadState !== 'not_uploaded')
        .map((a) => `${p.id}/${a.id}=${a.youtubeUploadState}`)
    );
    expect(wrong).toEqual([]);
  });

  test('no seed approval has any video ID at all', () => {
    const withIds = INITIAL_PROJECTS.flatMap((p) =>
      p.approvals.filter((a) => a.youtubeVideoId !== undefined).map((a) => `${p.id}/${a.id}`)
    );
    expect(withIds).toEqual([]);
  });
});

describe('demo seed data shape', () => {
  test('at least one demo project exists (empty states are handled elsewhere)', () => {
    expect(INITIAL_PROJECTS.length).toBeGreaterThan(0);
  });

  test('project ids are unique', () => {
    const ids = INITIAL_PROJECTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every project has a story bible and episode arrays of matching structure', () => {
    for (const project of INITIAL_PROJECTS) {
      expect(Array.isArray(project.storyBible.characters)).toBe(true);
      expect(Array.isArray(project.storyBible.worldRules)).toBe(true);
      expect(Array.isArray(project.storyBible.terminology)).toBe(true);
      expect(Array.isArray(project.episodes)).toBe(true);
      expect(Array.isArray(project.approvals)).toBe(true);
      for (const episode of project.episodes) {
        expect(Array.isArray(episode.scenes)).toBe(true);
        expect(Array.isArray(episode.outline)).toBe(true);
      }
    }
  });
});

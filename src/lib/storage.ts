import type { Project } from '../types/manhwa';

/** The only key this app reads/writes for project data (browser-local demo persistence). */
export const PROJECTS_STORAGE_KEY = 'manhwa_studio_projects';

/** Legacy key earlier builds used to store a provider API key; never read, only purged. */
export const LEGACY_PROVIDER_KEY = 'manhwa_gemini_key';

/** Hardcoded sample video ID an old demo build wrote into approval records. */
export const FABRICATED_VIDEO_ID = 'dQw4w9WgXcQ';

/**
 * Earlier demo builds wrote a hardcoded sample YouTube video ID into stored
 * approval records. Reset only those provably-fabricated publication fields;
 * never touch or delete any other user data. Pure function: input untouched.
 */
export function sanitizeStoredProjects(projects: Project[]): Project[] {
  return projects.map((project) => ({
    ...project,
    approvals: (project.approvals || []).map((approval) =>
      approval.youtubeVideoId === FABRICATED_VIDEO_ID
        ? { ...approval, youtubeUploadState: 'not_uploaded' as const, youtubeVideoId: undefined }
        : approval
    )
  }));
}

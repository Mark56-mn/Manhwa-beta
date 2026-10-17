export type ProjectStatus = 'draft' | 'in_production' | 'approved' | 'published';

export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  visualAnchor: string;
  personality: string;
}

export interface WorldRule {
  id: string;
  rule: string;
}

export interface TerminologyItem {
  id: string;
  term: string;
  definition: string;
}

export interface StoryBible {
  premise: string;
  logline: string;
  worldRules: WorldRule[];
  characters: Character[];
  terminology: TerminologyItem[];
}

export interface Scene {
  id: string;
  sceneNumber: number;
  setting: string;
  action: string;
  dialogue: string;
  narration: string;
  sfx: string;
  imagePrompt: string;
}

export interface Episode {
  id: string;
  episodeNumber: number;
  title: string;
  synopsis: string;
  outline: string[];
  scenes: Scene[];
}

export interface ApprovalRecord {
  id: string;
  artifactId: string;
  artifactTitle: string;
  type: 'script' | 'bible' | 'video';
  status: 'pending' | 'approved' | 'rejected';
  approver: string;
  timestamp: string;
  notes: string;
  youtubeUploadState: 'not_uploaded' | 'uploading' | 'private_uploaded' | 'published';
  youtubeVideoId?: string;
}

export interface Project {
  id: string;
  title: string;
  genre: string;
  synopsis: string;
  artStyle: string;
  status: ProjectStatus;
  updatedAt: string;
  coverImage: string;
  author: string;
  targetAudience: string;
  storyBible: StoryBible;
  episodes: Episode[];
  approvals: ApprovalRecord[];
}

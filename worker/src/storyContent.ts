/**
 * Story Bible / episode content contract and provider-output validation
 * (TASK 04).
 *
 * Nothing is saved until the content passes these strict, bounded checks.
 * A malformed provider reply becomes `provider_bad_response`, the job fails,
 * and the reserved credits are released — never a fabricated success.
 */

export interface StoryCharacter {
  name: string;
  role: string;
  motivation: string;
  abilities: string[];
  relationships: string[];
}

export interface StoryLocation {
  name: string;
  description: string;
}

export interface StoryFaction {
  name: string;
  description: string;
}

export interface StoryArc {
  title: string;
  summary: string;
}

export interface StoryBibleContent {
  premise: string;
  synopsis: string;
  worldbuilding: string;
  worldRules: string[];
  characters: StoryCharacter[];
  locations: StoryLocation[];
  factions: StoryFaction[];
  timeline: string[];
  continuity: string[];
  themes: string[];
  tone: string;
  structure: string;
  arcs: StoryArc[];
}

export interface EpisodeContent {
  title: string;
  outline: string[];
  script: string;
}

export class StoryContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryContentError';
  }
}

const LIMITS = {
  premise: 4000,
  synopsis: 8000,
  worldbuilding: 12000,
  shortText: 600,
  script: 40000,
  items: 40,
  characters: 40
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new StoryContentError(`${field} must be a string.`);
  }
  const text = value.trim();
  if (text.length === 0) throw new StoryContentError(`${field} is required.`);
  if (text.length > max) throw new StoryContentError(`${field} is too long.`);
  return text;
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new StoryContentError(`${field} must be a string.`);
  const text = value.trim();
  if (text.length > max) throw new StoryContentError(`${field} is too long.`);
  return text;
}

function textArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new StoryContentError(`${field} must be an array.`);
  if (value.length > LIMITS.items) throw new StoryContentError(`${field} has too many entries.`);
  return value.map((entry, index) => requiredText(entry, `${field}[${index}]`, LIMITS.shortText));
}

function recordArray<T>(
  value: unknown,
  field: string,
  max: number,
  map: (entry: Record<string, unknown>, path: string) => T
): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new StoryContentError(`${field} must be an array.`);
  if (value.length > max) throw new StoryContentError(`${field} has too many entries.`);
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new StoryContentError(`${field}[${index}] must be an object.`);
    return map(entry, `${field}[${index}]`);
  });
}

export function normalizeStoryBible(value: unknown): StoryBibleContent {
  if (!isRecord(value)) throw new StoryContentError('Story Bible must be an object.');
  return {
    premise: requiredText(value.premise, 'premise', LIMITS.premise),
    synopsis: requiredText(value.synopsis, 'synopsis', LIMITS.synopsis),
    worldbuilding: requiredText(value.worldbuilding, 'worldbuilding', LIMITS.worldbuilding),
    worldRules: textArray(value.worldRules, 'worldRules'),
    characters: recordArray(value.characters, 'characters', LIMITS.characters, (entry, path) => ({
      name: requiredText(entry.name, `${path}.name`, LIMITS.shortText),
      role: optionalText(entry.role, `${path}.role`, LIMITS.shortText),
      motivation: optionalText(entry.motivation, `${path}.motivation`, LIMITS.shortText),
      abilities: textArray(entry.abilities, `${path}.abilities`),
      relationships: textArray(entry.relationships, `${path}.relationships`)
    })),
    locations: recordArray(value.locations, 'locations', LIMITS.items, (entry, path) => ({
      name: requiredText(entry.name, `${path}.name`, LIMITS.shortText),
      description: optionalText(entry.description, `${path}.description`, LIMITS.synopsis)
    })),
    factions: recordArray(value.factions, 'factions', LIMITS.items, (entry, path) => ({
      name: requiredText(entry.name, `${path}.name`, LIMITS.shortText),
      description: optionalText(entry.description, `${path}.description`, LIMITS.synopsis)
    })),
    timeline: textArray(value.timeline, 'timeline'),
    continuity: textArray(value.continuity, 'continuity'),
    themes: textArray(value.themes, 'themes'),
    tone: requiredText(value.tone, 'tone', LIMITS.shortText),
    structure: requiredText(value.structure, 'structure', LIMITS.worldbuilding),
    arcs: recordArray(value.arcs, 'arcs', LIMITS.items, (entry, path) => ({
      title: requiredText(entry.title, `${path}.title`, LIMITS.shortText),
      summary: optionalText(entry.summary, `${path}.summary`, LIMITS.synopsis)
    }))
  };
}

export function normalizeEpisode(value: unknown): EpisodeContent {
  if (!isRecord(value)) throw new StoryContentError('Episode must be an object.');
  const outline = textArray(value.outline, 'outline');
  if (outline.length === 0) throw new StoryContentError('outline must contain at least one beat.');
  return {
    title: requiredText(value.title, 'title', LIMITS.shortText),
    outline,
    script: requiredText(value.script, 'script', LIMITS.script)
  };
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    throw new StoryContentError('Provider output was not valid JSON.');
  }
}

export function parseStoryBibleOutput(text: string): StoryBibleContent {
  return normalizeStoryBible(parseJsonObject(text));
}

export function parseEpisodeOutput(text: string): EpisodeContent {
  return normalizeEpisode(parseJsonObject(text));
}

export interface StoryBibleBrief {
  concept: string;
  genre?: string;
  language?: string;
  tone?: string;
  targetAudience?: string;
}

export interface EpisodeBrief {
  concept: string;
  episodeNumber: number;
  title?: string;
  notes?: string;
}

export interface ProjectBrief {
  title: string;
  genre?: string | null;
}

export function normalizeStoryBrief(value: Record<string, unknown>): StoryBibleBrief {
  return {
    concept: requiredText(value.concept, 'concept', 2000),
    genre: optionalText(value.genre, 'genre', 80) || undefined,
    language: optionalText(value.language, 'language', 40) || undefined,
    tone: optionalText(value.tone, 'tone', 200) || undefined,
    targetAudience: optionalText(value.targetAudience, 'targetAudience', 200) || undefined
  };
}

export function normalizeEpisodeBrief(value: Record<string, unknown>): EpisodeBrief {
  const rawNumber = value.episodeNumber;
  const episodeNumber =
    typeof rawNumber === 'number' ? rawNumber : typeof rawNumber === 'string' ? Number(rawNumber) : NaN;
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 9999) {
    throw new StoryContentError('episodeNumber must be an integer between 1 and 9999.');
  }
  return {
    concept: requiredText(value.concept, 'concept', 2000),
    episodeNumber,
    title: optionalText(value.title, 'title', 200) || undefined,
    notes: optionalText(value.notes, 'notes', 1000) || undefined
  };
}

const STORY_BIBLE_SCHEMA = `{
  "premise": "string",
  "synopsis": "string",
  "worldbuilding": "string",
  "worldRules": ["string"],
  "characters": [{"name":"string","role":"string","motivation":"string","abilities":["string"],"relationships":["string"]}],
  "locations": [{"name":"string","description":"string"}],
  "factions": [{"name":"string","description":"string"}],
  "timeline": ["string"],
  "continuity": ["string"],
  "themes": ["string"],
  "tone": "string",
  "structure": "string",
  "arcs": [{"title":"string","summary":"string"}]
}`;

export function buildStoryBiblePrompt(brief: StoryBibleBrief, project: ProjectBrief): string {
  return [
    'You are a professional manhwa story editor. Produce a production-ready Story Bible.',
    'Return ONLY a JSON object matching this schema (no markdown, no commentary):',
    STORY_BIBLE_SCHEMA,
    '',
    `Project: ${project.title}`,
    `Genre: ${brief.genre ?? project.genre ?? 'unspecified'}`,
    `Language: ${brief.language ?? 'English'}`,
    `Tone: ${brief.tone ?? 'unspecified'}`,
    `Target audience: ${brief.targetAudience ?? 'unspecified'}`,
    `Concept: ${brief.concept}`,
    '',
    'Keep every field concise, concrete and internally consistent. Characters must have clear motivations; world rules must be actionable; arcs must follow a coherent progression.'
  ].join('\n');
}

export function buildEpisodePrompt(
  brief: EpisodeBrief,
  project: ProjectBrief,
  bible: StoryBibleContent | null
): string {
  return [
    'You are a professional manhwa scriptwriter. Write one complete episode script.',
    'Return ONLY a JSON object matching this schema (no markdown, no commentary):',
    '{ "title": "string", "outline": ["beat"], "script": "full panel-by-panel script" }',
    '',
    `Project: ${project.title}`,
    `Episode number: ${brief.episodeNumber}`,
    brief.title ? `Requested title: ${brief.title}` : '',
    `Concept: ${brief.concept}`,
    brief.notes ? `Notes: ${brief.notes}` : '',
    bible
      ? [
          '',
          'Story Bible canon (must be respected):',
          `Premise: ${bible.premise}`,
          `Synopsis: ${bible.synopsis}`,
          `Worldbuilding: ${bible.worldbuilding}`,
          `World rules: ${bible.worldRules.join(' | ')}`,
          `Characters: ${bible.characters.map((character) => character.name).join(', ')}`,
          `Tone: ${bible.tone}`,
          `Continuity: ${bible.continuity.join(' | ')}`
        ].join('\n')
      : '',
    '',
    'The script must open with a hook, advance the arc, and end on a clear turn. Respect continuity.'
  ]
    .filter((line) => line !== '')
    .join('\n');
}

import {
  ApiError,
  type ApiClient,
  type CloudCredits,
  type CloudEpisode,
  type CloudJob,
  type CloudStoryBible,
  type CreditLedgerEntry,
  type CloudProjectProfile,
  type GenerationInput,
  type ProjectProfileInput,
  type GenerationResponse,
  type StoryBibleInput
} from './api';

/**
 * Story Studio workflow helpers (TASK 04).
 *
 * Pure, browser-independent logic for credits, Story Bibles, episodes and
 * generation outcomes. The UI renders these states literally: nothing is
 * labelled saved, generated or successful unless the server returned the
 * persisted record, and no failed generation is retried with a fresh charge
 * without telling the customer.
 */

export type StoryBoard =
  | {
      status: 'ready';
      profile: CloudProjectProfile | null;
      bible: CloudStoryBible | null;
      episodes: CloudEpisode[];
      credits: CloudCredits;
      history: CreditLedgerEntry[];
    }
  | { status: 'sign_in_required' }
  | { status: 'auth_not_configured'; message: string }
  | { status: 'error'; message: string; retryable: boolean };

export interface StoryFailure {
  ok: false;
  /** Browser-facing explanation; never claims work happened. */
  message: string;
  /** True when the request may have reached the server (safe to reuse key). */
  retrySameKey: boolean;
  job: CloudJob | null;
  signInRequired: boolean;
}

export type StoryResult<T> = { ok: true; value: T } | StoryFailure;

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Only a fallback for unusual runtimes; still URL-safe and >= 8 chars.
  return `key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function failureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'unauthorized':
        return 'Sign in required. Nothing was loaded or saved.';
      case 'not_configured':
        return 'This deployment has no identity provider configured.';
      case 'provider_not_configured':
        return 'The server has no AI provider configured. Nothing was generated or charged.';
      case 'insufficient_credits':
        return error.message || 'Not enough writing credits. Nothing was generated.';
      case 'forbidden':
        return error.message || 'This account cannot perform that action.';
      case 'network':
        return 'Could not reach the server. Check your connection and try again.';
      case 'timeout':
        return 'The request timed out. The result is unknown; retrying will not double-charge.';
      case 'aborted':
        return 'The request was cancelled.';
      case 'invalid_response':
        return 'The server returned an unexpected response. Nothing is shown as saved.';
      case 'bad_request':
      case 'not_found':
      case 'conflict':
        return error.message;
      default:
        return error.message || 'The server could not complete the request.';
    }
  }
  return 'The server could not be reached.';
}

function toFailure(error: unknown): StoryFailure {
  const payload = error instanceof ApiError ? error.payload : null;
  const job =
    payload &&
    typeof payload === 'object' &&
    'job' in payload &&
    payload.job &&
    typeof payload.job === 'object'
      ? (payload.job as CloudJob)
      : null;
  // Reuse the key only when the server may have persisted something we did
  // not hear about. A definitive provider failure (502/504/429) already
  // released its hold and needs a new key for the next attempt.
  const uncertain =
    error instanceof ApiError &&
    (error.kind === 'network' ||
      error.kind === 'timeout' ||
      error.kind === 'aborted' ||
      (error.kind === 'server' && (error.status === undefined || error.status === 500)));
  return {
    ok: false,
    message: failureMessage(error),
    retrySameKey: uncertain,
    job,
    signInRequired: error instanceof ApiError && error.kind === 'unauthorized'
  };
}

export async function loadStoryBoard(
  client: Pick<
    ApiClient,
    'getProjectProfile' | 'getStoryBible' | 'listEpisodes' | 'getCredits'
  >,
  projectId: string,
  signal?: AbortSignal
): Promise<StoryBoard> {
  try {
    const [profile, bible, episodes, credits] = await Promise.all([
      client.getProjectProfile(projectId, signal),
      client.getStoryBible(projectId, signal),
      client.listEpisodes(projectId, signal),
      client.getCredits(signal)
    ]);
    return {
      status: 'ready',
      profile,
      bible,
      episodes,
      credits: credits.credits,
      history: credits.history
    };
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'unauthorized') {
      return { status: 'sign_in_required' };
    }
    if (
      error instanceof ApiError &&
      (error.kind === 'not_configured' ||
        (error.kind === 'server' && error.code === 'auth_not_configured'))
    ) {
      return {
        status: 'auth_not_configured',
        message: 'This deployment has no identity provider configured.'
      };
    }
    return {
      status: 'error',
      message: failureMessage(error),
      retryable: error instanceof ApiError ? error.retryable : true
    };
  }
}

export async function generateContent(
  client: Pick<ApiClient, 'generate'>,
  projectId: string,
  input: GenerationInput,
  signal?: AbortSignal
): Promise<StoryResult<GenerationResponse>> {
  if (input.concept.trim().length === 0) {
    return {
      ok: false,
      message: 'Describe the story concept before generating.',
      retrySameKey: true,
      job: null,
      signInRequired: false
    };
  }
  try {
    const response = await client.generate(projectId, input, signal);
    if (response.job.status !== 'succeeded' || response.output === null) {
      return {
        ok: false,
        message:
          'The server did not return completed, saved content. Nothing was added to this project.',
        retrySameKey: false,
        job: response.job,
        signInRequired: false
      };
    }
    return { ok: true, value: response };
  } catch (error) {
    return toFailure(error);
  }
}

export async function saveProfile(
  client: Pick<ApiClient, 'saveProjectProfile'>,
  projectId: string,
  input: ProjectProfileInput,
  signal?: AbortSignal
): Promise<StoryResult<CloudProjectProfile>> {
  try {
    return { ok: true, value: await client.saveProjectProfile(projectId, input, signal) };
  } catch (error) {
    return toFailure(error);
  }
}

export async function saveBibleEdit(
  client: Pick<ApiClient, 'saveStoryBible'>,
  projectId: string,
  input: StoryBibleInput,
  signal?: AbortSignal
): Promise<StoryResult<CloudStoryBible>> {
  if (input.premise.trim().length === 0 || input.synopsis.trim().length === 0) {
    return {
      ok: false,
      message: 'A premise and synopsis are required.',
      retrySameKey: false,
      job: null,
      signInRequired: false
    };
  }
  try {
    return { ok: true, value: await client.saveStoryBible(projectId, input, signal) };
  } catch (error) {
    return toFailure(error);
  }
}

export async function approveEpisode(
  client: Pick<ApiClient, 'approveEpisode'>,
  projectId: string,
  episodeNumber: number,
  signal?: AbortSignal
): Promise<StoryResult<CloudEpisode>> {
  try {
    return {
      ok: true,
      value: await client.approveEpisode(projectId, episodeNumber, signal)
    };
  } catch (error) {
    return toFailure(error);
  }
}

/** Reset an editable form from a persisted Story Bible. */
export function bibleToInput(bible: CloudStoryBible): StoryBibleInput {
  return {
    premise: bible.premise,
    synopsis: bible.synopsis,
    worldbuilding: bible.worldbuilding,
    world_rules: bible.world_rules,
    characters: bible.characters,
    locations: bible.locations,
    factions: bible.factions,
    timeline: bible.timeline,
    continuity: bible.continuity,
    themes: bible.themes,
    tone: bible.tone,
    structure: bible.structure,
    arcs: bible.arcs
  };
}

/** Parse textarea lines into trimmed, non-empty entries. */
export function linesToArray(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function jobLabel(job: CloudJob | null): string {
  if (!job) return 'No job';
  if (job.status === 'succeeded') return 'Succeeded';
  if (job.status === 'failed') return `Failed${job.error_code ? ` (${job.error_code})` : ''}`;
  if (job.status === 'running') return 'Running';
  return 'Pending';
}

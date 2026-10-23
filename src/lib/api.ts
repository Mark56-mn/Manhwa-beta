/**
 * The single frontend → shared API client (TASK-IMPLEMENT-SHARED-FOUNDATION).
 *
 * Design rules:
 *  - One typed module performs network calls; components never call `fetch`.
 *  - The API origin is configuration (`VITE_API_BASE_URL`), never hardcoded and
 *    never a secret. Empty means same-origin (the Freebuff-hosted build).
 *  - Session auth is the server-issued cookie: `credentials: 'include'`. There
 *    is no token in browser storage and no fabricated user identity.
 *  - Failures are typed and honest: 401/403/503, network, timeout, cancellation
 *    and malformed responses are distinct, and none of them is silently
 *    replaced with demo/local data.
 *  - A success value is only returned after the server confirmed it.
 */

export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'conflict'
  | 'insufficient_credits'
  | 'not_configured'
  | 'provider_not_configured'
  | 'server'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'invalid_response';

export interface ApiErrorOptions {
  status?: number;
  code?: string;
  cause?: unknown;
  /** Parsed response body, used to show a failed generation job. */
  payload?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly payload?: unknown;

  constructor(kind: ApiErrorKind, message: string, options: ApiErrorOptions = {}) {
    super(message, 'cause' in options ? { cause: options.cause } : undefined);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
    this.payload = options.payload;
  }

  /** Only transient failures are worth retrying; 401/403/400 are not. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'server';
  }
}

export interface CloudSession {
  sub: string;
  name: string | null;
}

export interface CloudProject {
  id: string;
  title: string;
  genre: string | null;
  status: 'draft' | 'in_production' | 'approved' | 'published';
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  title: string;
  genre?: string | null;
}

export interface CreditCosts {
  story_bible: number;
  episode_script: number;
}

export interface CloudCredits {
  balance: number;
  plan: string;
  initial_granted_at: string | null;
  costs: CreditCosts;
}

export interface CreditLedgerEntry {
  type: 'grant' | 'reserve' | 'settle' | 'release';
  amount: number;
  balance_after: number;
  idempotency_key: string;
  job_id: string | null;
  reason: string;
  created_at: string;
}

export interface CreditsResponse {
  credits: CloudCredits;
  history: CreditLedgerEntry[];
}

export interface CloudProjectProfile {
  project_id: string;
  description: string | null;
  language: string | null;
  target_audience: string | null;
  updated_at: string;
}

export interface ProjectProfileInput {
  description?: string | null;
  language?: string | null;
  targetAudience?: string | null;
}

export interface CloudStoryBible {
  id: string;
  project_id: string;
  version: number;
  premise: string;
  synopsis: string;
  worldbuilding: string;
  world_rules: string[];
  characters: Array<{
    name: string;
    role: string;
    motivation: string;
    abilities: string[];
    relationships: string[];
  }>;
  locations: Array<{ name: string; description: string }>;
  factions: Array<{ name: string; description: string }>;
  timeline: string[];
  continuity: string[];
  themes: string[];
  tone: string;
  structure: string;
  arcs: Array<{ title: string; summary: string }>;
  created_at: string;
  updated_at: string;
}

export interface CloudEpisode {
  id: string;
  project_id: string;
  episode_number: number;
  version: number;
  title: string;
  outline: string[];
  script: string;
  status: 'draft' | 'generating' | 'ready_for_review' | 'failed' | 'approved';
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudJob {
  id: string;
  project_id: string;
  type: 'story_bible' | 'episode_script';
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  provider: string | null;
  model: string | null;
  output_type: 'story_bible' | 'episode' | null;
  output_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export type GenerationOutput =
  | { kind: 'story_bible'; story_bible: CloudStoryBible }
  | { kind: 'episode'; episode: CloudEpisode };

export interface GenerationResponse {
  job: CloudJob;
  output: GenerationOutput | null;
  duplicate?: boolean;
  credits: CloudCredits;
}

export interface JobResponse {
  job: CloudJob;
  output: GenerationOutput | null;
}

export type StoryBibleInput = Pick<
  CloudStoryBible,
  | 'premise'
  | 'synopsis'
  | 'worldbuilding'
  | 'world_rules'
  | 'characters'
  | 'locations'
  | 'factions'
  | 'timeline'
  | 'continuity'
  | 'themes'
  | 'tone'
  | 'structure'
  | 'arcs'
>;

export type GenerationInput =
  | {
      type: 'story_bible';
      idempotencyKey: string;
      concept: string;
      genre?: string;
      language?: string;
      tone?: string;
      targetAudience?: string;
    }
  | {
      type: 'episode_script';
      idempotencyKey: string;
      concept: string;
      episodeNumber: number;
      title?: string;
      notes?: string;
    };

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  /** Public API origin, e.g. `https://api.example`. Empty = same origin. */
  baseUrl?: string;
  fetchImpl?: FetchLike;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

export interface ApiClient {
  readonly baseUrl: string;
  getSession(signal?: AbortSignal): Promise<CloudSession>;
  listProjects(signal?: AbortSignal): Promise<CloudProject[]>;
  createProject(input: CreateProjectInput, signal?: AbortSignal): Promise<CloudProject>;
  getCredits(signal?: AbortSignal): Promise<CreditsResponse>;
  getProjectProfile(
    projectId: string,
    signal?: AbortSignal
  ): Promise<CloudProjectProfile | null>;
  saveProjectProfile(
    projectId: string,
    input: ProjectProfileInput,
    signal?: AbortSignal
  ): Promise<CloudProjectProfile>;
  getStoryBible(projectId: string, signal?: AbortSignal): Promise<CloudStoryBible | null>;
  saveStoryBible(
    projectId: string,
    input: StoryBibleInput,
    signal?: AbortSignal
  ): Promise<CloudStoryBible>;
  listEpisodes(projectId: string, signal?: AbortSignal): Promise<CloudEpisode[]>;
  generate(projectId: string, input: GenerationInput, signal?: AbortSignal): Promise<GenerationResponse>;
  getJob(jobId: string, signal?: AbortSignal): Promise<JobResponse>;
  approveEpisode(projectId: string, episodeNumber: number, signal?: AbortSignal): Promise<CloudEpisode>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readConfiguredBaseUrl(): string {
  try {
    const value = (import.meta as { env?: Record<string, unknown> }).env?.VITE_API_BASE_URL;
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

function errorKind(status: number, code: string | undefined): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'bad_request';
  if (status === 402) return 'insufficient_credits';
  if (status === 503 && code === 'provider_not_configured') return 'provider_not_configured';
  if (status === 503 && (code === 'auth_not_configured' || code === 'not_configured')) {
    return 'not_configured';
  }
  return 'server';
}

function assertCloudProject(value: unknown): CloudProject {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    typeof value.title !== 'string'
  ) {
    throw new ApiError('invalid_response', 'The API returned a malformed project record.');
  }
  return value as unknown as CloudProject;
}

function assertProjectProfile(value: unknown): CloudProjectProfile {
  if (
    !isRecord(value) ||
    typeof value.project_id !== 'string' ||
    typeof value.updated_at !== 'string'
  ) {
    throw new ApiError('invalid_response', 'The API returned a malformed project profile.');
  }
  return value as unknown as CloudProjectProfile;
}

function assertStoryBible(value: unknown): CloudStoryBible {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.project_id !== 'string' ||
    typeof value.version !== 'number' ||
    typeof value.premise !== 'string' ||
    !Array.isArray(value.characters)
  ) {
    throw new ApiError('invalid_response', 'The API returned a malformed Story Bible.');
  }
  return value as unknown as CloudStoryBible;
}

function assertEpisode(value: unknown): CloudEpisode {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.project_id !== 'string' ||
    typeof value.episode_number !== 'number' ||
    typeof value.version !== 'number' ||
    typeof value.status !== 'string'
  ) {
    throw new ApiError('invalid_response', 'The API returned a malformed episode.');
  }
  return value as unknown as CloudEpisode;
}

function assertJob(value: unknown): CloudJob {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.status !== 'pending' &&
      value.status !== 'running' &&
      value.status !== 'succeeded' &&
      value.status !== 'failed')
  ) {
    throw new ApiError('invalid_response', 'The API returned a malformed generation job.');
  }
  return value as unknown as CloudJob;
}

function assertCredits(value: unknown): CloudCredits {
  if (
    !isRecord(value) ||
    typeof value.balance !== 'number' ||
    !isRecord(value.costs) ||
    typeof value.costs.story_bible !== 'number' ||
    typeof value.costs.episode_script !== 'number'
  ) {
    throw new ApiError('invalid_response', 'The API returned malformed credit data.');
  }
  return value as unknown as CloudCredits;
}

function parseOutput(value: unknown): GenerationOutput | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'story_bible' && value.story_bible !== undefined) {
    return { kind: 'story_bible', story_bible: assertStoryBible(value.story_bible) };
  }
  if (value.kind === 'episode' && value.episode !== undefined) {
    return { kind: 'episode', episode: assertEpisode(value.episode) };
  }
  throw new ApiError('invalid_response', 'The API returned an unknown generation output.');
}

function parseGeneration(value: unknown): GenerationResponse {
  if (!isRecord(value) || value.job === undefined) {
    throw new ApiError('invalid_response', 'The API did not return the generation job.');
  }
  return {
    job: assertJob(value.job),
    output: parseOutput(value.output),
    duplicate: value.duplicate === true,
    credits: assertCredits(value.credits)
  };
}

function parseJob(value: unknown): JobResponse {
  if (!isRecord(value) || value.job === undefined) {
    throw new ApiError('invalid_response', 'The API did not return the generation job.');
  }
  return { job: assertJob(value.job), output: parseOutput(value.output) };
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? readConfiguredBaseUrl()).replace(/\/+$/, '');
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<T> {
    const method = init.method ?? 'GET';
    const timeoutMs = init.timeoutMs ?? defaultTimeoutMs;
    const externalSignal = init.signal;

    if (externalSignal?.aborted) {
      throw new ApiError('aborted', 'Request cancelled.');
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forwardAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (init.body !== undefined) headers['Content-Type'] = 'application/json';

      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        credentials: 'include',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal
      });

      const text = await response.text();
      let parsed: unknown = null;
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
      }

      const code =
        isRecord(parsed) && typeof parsed.error === 'string' ? parsed.error : undefined;
      const detail =
        isRecord(parsed) && typeof parsed.detail === 'string' ? parsed.detail : undefined;

      if (!response.ok) {
        throw new ApiError(
          errorKind(response.status, code),
          detail ?? `The API request failed (HTTP ${response.status}).`,
          { status: response.status, code, payload: parsed }
        );
      }

      if (response.status === 204) return undefined as T;
      if (parsed === null) {
        throw new ApiError('invalid_response', 'The API returned a non-JSON response.', {
          status: response.status
        });
      }
      return parsed as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (externalSignal?.aborted) {
        throw new ApiError('aborted', 'Request cancelled.', { cause: error });
      }
      if (timedOut) {
        throw new ApiError(
          'timeout',
          `The API did not respond within ${timeoutMs} ms.`,
          { cause: error }
        );
      }
      throw new ApiError('network', 'Could not reach the API server.', { cause: error });
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', forwardAbort);
    }
  }

  return {
    baseUrl,

    async getSession(signal?: AbortSignal): Promise<CloudSession> {
      const body = await request<{ sub?: unknown; name?: unknown }>('/api/v1/me', { signal });
      if (!isRecord(body) || typeof body.sub !== 'string' || body.sub.length === 0) {
        throw new ApiError('invalid_response', 'The API returned a malformed session.');
      }
      return { sub: body.sub, name: typeof body.name === 'string' ? body.name : null };
    },

    async listProjects(signal?: AbortSignal): Promise<CloudProject[]> {
      const body = await request<{ projects?: unknown }>('/api/v1/projects', { signal });
      if (!isRecord(body) || !Array.isArray(body.projects)) {
        throw new ApiError('invalid_response', 'The API returned a malformed project list.');
      }
      return body.projects.map(assertCloudProject);
    },

    async createProject(input: CreateProjectInput, signal?: AbortSignal): Promise<CloudProject> {
      const body = await request<{ project?: unknown }>('/api/v1/projects', {
        method: 'POST',
        body: { title: input.title, genre: input.genre ?? null },
        signal
      });
      if (!isRecord(body) || body.project === undefined) {
        throw new ApiError('invalid_response', 'The API did not return the created project.');
      }
      return assertCloudProject(body.project);
    },

    async getCredits(signal?: AbortSignal): Promise<CreditsResponse> {
      const body = await request<{ credits?: unknown; history?: unknown }>('/api/v1/credits', {
        signal
      });
      if (!isRecord(body) || !Array.isArray(body.history)) {
        throw new ApiError('invalid_response', 'The API returned malformed credit history.');
      }
      return {
        credits: assertCredits(body.credits),
        history: body.history.filter(isRecord) as unknown as CreditLedgerEntry[]
      };
    },

    async getProjectProfile(
      projectId: string,
      signal?: AbortSignal
    ): Promise<CloudProjectProfile | null> {
      const body = await request<{ profile?: unknown }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/profile`,
        { signal }
      );
      if (!isRecord(body)) {
        throw new ApiError('invalid_response', 'The API returned a malformed project profile.');
      }
      if (body.profile === null) return null;
      if (body.profile === undefined) {
        throw new ApiError('invalid_response', 'The API did not return the project profile.');
      }
      return assertProjectProfile(body.profile);
    },

    async saveProjectProfile(
      projectId: string,
      input: ProjectProfileInput,
      signal?: AbortSignal
    ): Promise<CloudProjectProfile> {
      const body = await request<{ profile?: unknown }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/profile`,
        { method: 'PUT', body: input, signal }
      );
      if (!isRecord(body) || body.profile === undefined || body.profile === null) {
        throw new ApiError('invalid_response', 'The API did not return the saved project profile.');
      }
      return assertProjectProfile(body.profile);
    },

    async getStoryBible(
      projectId: string,
      signal?: AbortSignal
    ): Promise<CloudStoryBible | null> {
      try {
        const body = await request<{ story_bible?: unknown }>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/story-bible`,
          { signal }
        );
        if (!isRecord(body) || body.story_bible === undefined) {
          throw new ApiError('invalid_response', 'The API did not return a Story Bible.');
        }
        return assertStoryBible(body.story_bible);
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'not_found') return null;
        throw error;
      }
    },

    async saveStoryBible(
      projectId: string,
      input: StoryBibleInput,
      signal?: AbortSignal
    ): Promise<CloudStoryBible> {
      const body = await request<{ story_bible?: unknown }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/story-bible`,
        { method: 'PUT', body: input, signal }
      );
      if (!isRecord(body) || body.story_bible === undefined) {
        throw new ApiError('invalid_response', 'The API did not return the saved Story Bible.');
      }
      return assertStoryBible(body.story_bible);
    },

    async listEpisodes(projectId: string, signal?: AbortSignal): Promise<CloudEpisode[]> {
      const body = await request<{ episodes?: unknown }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/episodes`,
        { signal }
      );
      if (!isRecord(body) || !Array.isArray(body.episodes)) {
        throw new ApiError('invalid_response', 'The API returned a malformed episode list.');
      }
      return body.episodes.map(assertEpisode);
    },

    async generate(
      projectId: string,
      input: GenerationInput,
      signal?: AbortSignal
    ): Promise<GenerationResponse> {
      // Generation can take longer than a read; keep a bounded, larger timeout.
      const body = await request<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/generations`,
        { method: 'POST', body: input, signal, timeoutMs: 60_000 }
      );
      return parseGeneration(body);
    },

    async getJob(jobId: string, signal?: AbortSignal): Promise<JobResponse> {
      const body = await request<unknown>(`/api/v1/jobs/${encodeURIComponent(jobId)}`, { signal });
      return parseJob(body);
    },

    async approveEpisode(
      projectId: string,
      episodeNumber: number,
      signal?: AbortSignal
    ): Promise<CloudEpisode> {
      const body = await request<{ episode?: unknown }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/episodes/${episodeNumber}`,
        { method: 'PATCH', body: { status: 'approved' }, signal }
      );
      if (!isRecord(body) || body.episode === undefined) {
        throw new ApiError('invalid_response', 'The API did not return the approved episode.');
      }
      return assertEpisode(body.episode);
    }
  };
}

/** Default client: same-origin unless VITE_API_BASE_URL is configured. */
export const api = createApiClient();

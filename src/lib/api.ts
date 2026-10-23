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
  | 'not_configured'
  | 'server'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'invalid_response';

export interface ApiErrorOptions {
  status?: number;
  code?: string;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(kind: ApiErrorKind, message: string, options: ApiErrorOptions = {}) {
    super(message, 'cause' in options ? { cause: options.cause } : undefined);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
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
          { status: response.status, code }
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
    }
  };
}

/** Default client: same-origin unless VITE_API_BASE_URL is configured. */
export const api = createApiClient();

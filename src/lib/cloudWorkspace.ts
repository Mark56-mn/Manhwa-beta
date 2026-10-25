import { ApiError, type ApiClient, type CloudProject, type CreateProjectInput } from './api';

/**
 * Cloud workspace state machine (TASK-IMPLEMENT-SHARED-FOUNDATION).
 *
 * Kept out of React so every branch (loading, signed out, auth not configured,
 * forbidden, empty, ready, transient failure, save failure) is unit-testable
 * without a browser. The UI renders these states literally; no state can claim
 * a server save that did not happen.
 */

export type CloudWorkspaceState =
  | { status: 'loading' }
  | { status: 'api_misconfigured'; detail: string }
  | { status: 'signed_out' }
  | { status: 'not_configured'; detail: string }
  | { status: 'forbidden'; detail: string }
  /** The API origin did not answer at all (down, blocked, offline, timed out). */
  | { status: 'unavailable'; detail: string }
  | { status: 'error'; message: string; retryable: boolean }
  | { status: 'ready'; projects: CloudProject[] };

export type CloudSaveResult =
  | { ok: true; project: CloudProject; notice: string }
  | { ok: false; state: CloudWorkspaceState; message: string };

function failureState(error: unknown): CloudWorkspaceState {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'unauthorized':
        return { status: 'signed_out' };
      case 'api_not_configured':
        // The build itself is misconfigured (no usable VITE_API_BASE_URL for
        // this host). Never reported as "signed out" or "not configured by
        // the server", because the cause and the fix are different.
        return { status: 'api_misconfigured', detail: error.message };
      case 'not_configured':
        return {
          status: 'not_configured',
          detail:
            'This deployment has no identity provider configured, so the shared workspace cannot be opened.'
        };
      case 'forbidden':
        return {
          status: 'forbidden',
          detail: error.message || 'Your account is not a member of an organization.'
        };
      case 'network':
      case 'timeout':
        // Distinct from a server that answered with an error: nothing came
        // back, so the deployment or the network is the problem, not the data.
        return { status: 'unavailable', detail: error.message };
      case 'aborted':
        return { status: 'error', message: 'The request was cancelled.', retryable: true };
      case 'bad_request':
      case 'not_found':
      case 'conflict':
      case 'invalid_response':
        return { status: 'error', message: error.message, retryable: false };
      default:
        return { status: 'error', message: error.message, retryable: error.retryable };
    }
  }
  return {
    status: 'error',
    message: 'The shared API could not be reached.',
    retryable: true
  };
}

/** Load session + projects. Never falls back to local/demo data. */
export async function loadCloudWorkspace(
  client: Pick<ApiClient, 'getSession' | 'listProjects'>,
  signal?: AbortSignal
): Promise<CloudWorkspaceState> {
  try {
    await client.getSession(signal);
    const projects = await client.listProjects(signal);
    return { status: 'ready', projects };
  } catch (error) {
    return failureState(error);
  }
}

/**
 * Create a project. The success notice is returned only when the server has
 * confirmed the record; on failure no project is produced.
 */
export async function saveCloudProject(
  client: Pick<ApiClient, 'createProject'>,
  input: CreateProjectInput,
  signal?: AbortSignal
): Promise<CloudSaveResult> {
  const title = input.title.trim();
  if (title.length === 0) {
    return {
      ok: false,
      state: { status: 'error', message: 'A title is required.', retryable: false },
      message: 'A title is required.'
    };
  }

  try {
    const project = await client.createProject({ title, genre: input.genre ?? null }, signal);
    return {
      ok: true,
      project,
      notice: `Saved on the shared server as ${project.id}.`
    };
  } catch (error) {
    const state = failureState(error);
    return { ok: false, state, message: saveFailureMessage(state) };
  }
}

function saveFailureMessage(state: CloudWorkspaceState): string {
  switch (state.status) {
    case 'error':
      return state.message;
    case 'signed_out':
      return 'You are not signed in; nothing was saved.';
    case 'api_misconfigured':
      return 'This build is not configured to reach the API; nothing was saved.';
    case 'unavailable':
      return 'The API did not answer; nothing was saved.';
    case 'not_configured':
      return 'The server has no identity provider configured; nothing was saved.';
    case 'forbidden':
      return 'You are not allowed to create projects here; nothing was saved.';
    default:
      return 'Nothing was saved.';
  }
}

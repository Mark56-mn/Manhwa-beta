import { describe, expect, it } from 'bun:test';
import { ApiError, type ApiClient, type CloudProject } from '../src/lib/api';
import { loadCloudWorkspace, saveCloudProject } from '../src/lib/cloudWorkspace';

/**
 * Cloud workspace state tests (TASK-IMPLEMENT-SHARED-FOUNDATION).
 *
 * Every UI state is produced here, so the panel cannot drift into claiming a
 * session, an empty server list or a save that did not happen.
 */

const PROJECT: CloudProject = {
  id: 'proj-1',
  title: 'Cloud project',
  genre: 'Action',
  status: 'draft',
  created_at: '2026-10-23T00:00:00Z',
  updated_at: '2026-10-23T00:00:00Z'
};

type LoadClient = Pick<ApiClient, 'getSession' | 'listProjects'>;
type CreateClient = Pick<ApiClient, 'createProject'>;

function loadClient(overrides: Partial<LoadClient> = {}): LoadClient {
  return {
    getSession: async () => ({ sub: 'sub-1', name: null }),
    listProjects: async () => [],
    ...overrides
  };
}

function createClient(overrides: Partial<CreateClient> = {}): CreateClient {
  return {
    createProject: async () => PROJECT,
    ...overrides
  };
}

describe('loadCloudWorkspace', () => {
  it('returns ready with an empty list (a real empty server result)', async () => {
    await expect(loadCloudWorkspace(loadClient())).resolves.toEqual({
      status: 'ready',
      projects: []
    });
  });

  it('returns ready with the server project list', async () => {
    await expect(
      loadCloudWorkspace(loadClient({ listProjects: async () => [PROJECT] }))
    ).resolves.toEqual({ status: 'ready', projects: [PROJECT] });
  });

  it('maps 401 to signed_out', async () => {
    const state = await loadCloudWorkspace(
      loadClient({
        getSession: async () => {
          throw new ApiError('unauthorized', 'unauthorized', { status: 401 });
        }
      })
    );
    expect(state).toEqual({ status: 'signed_out' });
  });

  it('maps auth_not_configured to an explicit not_configured state', async () => {
    const state = await loadCloudWorkspace(
      loadClient({
        getSession: async () => {
          throw new ApiError('not_configured', 'auth_not_configured', {
            status: 503,
            code: 'auth_not_configured'
          });
        }
      })
    );
    expect(state.status).toBe('not_configured');
  });

  it('maps 403 to forbidden with the server detail', async () => {
    const state = await loadCloudWorkspace(
      loadClient({
        listProjects: async () => {
          throw new ApiError('forbidden', 'Not a member of any organization.', { status: 403 });
        }
      })
    );
    expect(state).toEqual({
      status: 'forbidden',
      detail: 'Not a member of any organization.'
    });
  });

  it('maps a 500 to a retryable error', async () => {
    const state = await loadCloudWorkspace(
      loadClient({
        listProjects: async () => {
          throw new ApiError('server', 'The API request failed (HTTP 500).', { status: 500 });
        }
      })
    );
    expect(state.status).toBe('error');
    if (state.status === 'error') expect(state.retryable).toBe(true);
  });

  it('maps an unreachable API to an explicit unavailable state, not a generic error', async () => {
    const state = await loadCloudWorkspace(
      loadClient({
        getSession: async () => {
          throw new ApiError('network', 'Could not reach the API server.');
        }
      })
    );
    expect(state).toEqual({ status: 'unavailable', detail: 'Could not reach the API server.' });
  });

  it('maps a timeout to the same unavailable state and keeps the measured limit', async () => {
    const state = await loadCloudWorkspace(
      loadClient({
        listProjects: async () => {
          throw new ApiError('timeout', 'The API did not respond within 10000 ms.');
        }
      })
    );
    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') expect(state.detail).toContain('10000 ms');
  });

  it('a server that answered with an error stays an error, not unavailable', async () => {
    const state = await loadCloudWorkspace(
      loadClient({
        listProjects: async () => {
          throw new ApiError('server', 'The API request failed (HTTP 500).', { status: 500 });
        }
      })
    );
    expect(state.status).toBe('error');
  });

  it('maps invalid responses to a non-retryable error', async () => {
    const state = await loadCloudWorkspace(
      loadClient({
        listProjects: async () => {
          throw new ApiError('invalid_response', 'The API returned a malformed project list.');
        }
      })
    );
    expect(state.status).toBe('error');
    if (state.status === 'error') expect(state.retryable).toBe(false);
  });

  it('never returns local or demo projects on failure', async () => {
    const state = await loadCloudWorkspace(
      loadClient({
        listProjects: async () => {
          throw new ApiError('unauthorized', 'unauthorized', { status: 401 });
        }
      })
    );
    expect(state.status).not.toBe('ready');
  });
});

describe('saveCloudProject', () => {
  it('returns the confirmed server record only after the client resolves', async () => {
    const calls: Array<{ title: string; genre?: string | null }> = [];
    const result = await saveCloudProject(
      createClient({
        createProject: async (input) => {
          calls.push(input);
          return PROJECT;
        }
      }),
      { title: '  Cloud project  ', genre: 'Action' }
    );

    expect(calls).toEqual([{ title: 'Cloud project', genre: 'Action' }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project).toEqual(PROJECT);
      expect(result.notice).toContain(PROJECT.id);
    }
  });

  it('sends genre as null when omitted', async () => {
    let received: { title: string; genre?: string | null } | undefined;
    await saveCloudProject(
      createClient({
        createProject: async (input) => {
          received = input;
          return PROJECT;
        }
      }),
      { title: 'No genre' }
    );
    expect(received).toEqual({ title: 'No genre', genre: null });
  });

  it('refuses a blank title without calling the server', async () => {
    let called = false;
    const result = await saveCloudProject(
      createClient({
        createProject: async () => {
          called = true;
          return PROJECT;
        }
      }),
      { title: '   ' }
    );
    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('A title is required.');
      expect(result.state.status).toBe('error');
    }
  });

  it('reports a signed-out save honestly and produces no project', async () => {
    const result = await saveCloudProject(
      createClient({
        createProject: async () => {
          throw new ApiError('unauthorized', 'unauthorized', { status: 401 });
        }
      }),
      { title: 'Draft' }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toEqual({ status: 'signed_out' });
      expect(result.message).toContain('nothing was saved');
    }
  });

  it('reports a server without an identity provider honestly', async () => {
    const result = await saveCloudProject(
      createClient({
        createProject: async () => {
          throw new ApiError('not_configured', 'No identity provider.', {
            status: 503,
            code: 'auth_not_configured'
          });
        }
      }),
      { title: 'Draft' }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state.status).toBe('not_configured');
      expect(result.message).toContain('nothing was saved');
    }
  });

  it('reports an unreachable API honestly and produces no project', async () => {
    const result = await saveCloudProject(
      createClient({
        createProject: async () => {
          throw new ApiError('network', 'Could not reach the API server.');
        }
      }),
      { title: 'Draft' }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state.status).toBe('unavailable');
      expect(result.message).toBe('The API did not answer; nothing was saved.');
    }
  });

  it('surfaces a validation message from the server as non-retryable', async () => {
    const result = await saveCloudProject(
      createClient({
        createProject: async () => {
          throw new ApiError('bad_request', 'title is required (1-200 characters).', {
            status: 400,
            code: 'bad_request'
          });
        }
      }),
      { title: 'x' }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state.status).toBe('error');
      if (result.state.status === 'error') expect(result.state.retryable).toBe(false);
      expect(result.message).toContain('title is required');
    }
  });
});

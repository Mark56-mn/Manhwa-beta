import { describe, expect, it } from 'bun:test';
import { ApiError, createApiClient, type CloudProject, type FetchLike } from '../src/lib/api';

/**
 * Frontend API client tests (TASK-IMPLEMENT-SHARED-FOUNDATION).
 *
 * These run without a network: the client's fetch is injected. They prove the
 * client's contract — honest error kinds, cancellation, timeouts and that a
 * success value exists only when the server returned one.
 */

const BASE = 'https://api.example';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

interface Recorded {
  url: string;
  init: RequestInit;
}

function recordingFetch(respond: () => Response | Promise<Response>): {
  fetchImpl: FetchLike;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return respond();
  };
  return { fetchImpl, calls };
}

const PROJECT: CloudProject = {
  id: 'proj-1',
  title: 'Cloud project',
  genre: 'Action',
  status: 'draft',
  created_at: '2026-10-23T00:00:00Z',
  updated_at: '2026-10-23T00:00:00Z'
};

describe('successful requests', () => {
  it('lists projects with credentials and no token in browser code', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ projects: [PROJECT] }));
    const client = createApiClient({ baseUrl: BASE, fetchImpl });

    const projects = await client.listProjects();

    expect(projects).toEqual([PROJECT]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/api/v1/projects`);
    expect(calls[0].init.method).toBe('GET');
    // Bearer tokens need no ambient cookie, so nothing is sent implicitly.
    expect(calls[0].init.credentials).toBe('omit');

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.stringify(headers).toLowerCase()).not.toContain('bearer');
  });

  it('reads the session from the server', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ sub: 'sub-1', name: 'Ada' }));
    const client = createApiClient({ baseUrl: BASE, fetchImpl });
    await expect(client.getSession()).resolves.toEqual({ sub: 'sub-1', name: 'Ada' });
  });

  it('creates a project and returns the server record', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ project: PROJECT }, 201));
    const client = createApiClient({ baseUrl: BASE, fetchImpl });

    const created = await client.createProject({ title: 'Cloud project', genre: 'Action' });

    expect(created).toEqual(PROJECT);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe(JSON.stringify({ title: 'Cloud project', genre: 'Action' }));
  });

  it('trims a trailing slash from a configured base URL', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ projects: [] }));
    const client = createApiClient({ baseUrl: `${BASE}/`, fetchImpl });
    await client.listProjects();
    expect(calls[0].url).toBe(`${BASE}/api/v1/projects`);
  });
});

describe('HTTP failures are mapped honestly', () => {
  async function expectKind(
    status: number,
    body: unknown,
    kind: string,
    expectedRetryable: boolean
  ) {
    const { fetchImpl } = recordingFetch(() => jsonResponse(body, status));
    const client = createApiClient({ baseUrl: BASE, fetchImpl });
    let caught: unknown;
    try {
      await client.listProjects();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const apiError = caught as ApiError;
    expect(apiError.kind).toBe(kind as ApiError['kind']);
    expect(apiError.retryable).toBe(expectedRetryable);
    return apiError;
  }

  it('401 → unauthorized (not retryable)', async () => {
    await expectKind(401, { error: 'unauthorized' }, 'unauthorized', false);
  });

  it('403 → forbidden', async () => {
    await expectKind(403, { error: 'forbidden', detail: 'Not a member.' }, 'forbidden', false);
  });

  it('503 auth_not_configured → not_configured', async () => {
    const error = await expectKind(
      503,
      { error: 'auth_not_configured', detail: 'No client configured.' },
      'not_configured',
      false
    );
    expect(error.code).toBe('auth_not_configured');
  });

  it('500 → server (retryable)', async () => {
    await expectKind(500, { error: 'internal' }, 'server', true);
  });

  it('400 → bad_request', async () => {
    await expectKind(400, { error: 'bad_request', detail: 'title is required' }, 'bad_request', false);
  });

  it('preserves the server detail message', async () => {
    const error = await expectKind(
      403,
      { error: 'forbidden', detail: 'Mutations only allowed from an allow-listed app origin.' },
      'forbidden',
      false
    );
    expect(error.message).toContain('allow-listed app origin');
  });
});

describe('transport failures are distinct', () => {
  it('network rejection → network', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('offline');
    };
    const client = createApiClient({ baseUrl: BASE, fetchImpl });
    const error = (await client.listProjects().catch((e) => e)) as ApiError;
    expect(error.kind).toBe('network');
    expect(error.retryable).toBe(true);
  });

  it('a hanging request becomes a timeout', async () => {
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      });
    const client = createApiClient({ baseUrl: BASE, fetchImpl, timeoutMs: 20 });
    const error = (await client.listProjects().catch((e) => e)) as ApiError;
    expect(error.kind).toBe('timeout');
    expect(error.message).toContain('20 ms');
    expect(error.retryable).toBe(true);
  });

  it('an already-aborted signal never calls fetch', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ projects: [] }));
    const client = createApiClient({ baseUrl: BASE, fetchImpl });
    const controller = new AbortController();
    controller.abort();
    const error = (await client.listProjects(controller.signal).catch((e) => e)) as ApiError;
    expect(error.kind).toBe('aborted');
    expect(calls).toHaveLength(0);
  });

  it('an abort during the request is not reported as a network failure', async () => {
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      });
    const client = createApiClient({ baseUrl: BASE, fetchImpl, timeoutMs: 5_000 });
    const controller = new AbortController();
    const pending = client.listProjects(controller.signal);
    controller.abort();
    const error = (await pending.catch((e) => e)) as ApiError;
    expect(error.kind).toBe('aborted');
  });
});

describe('malformed responses never become fake success', () => {
  it('rejects a non-JSON 200 response', async () => {
    const { fetchImpl } = recordingFetch(() => new Response('<html>oops</html>', { status: 200 }));
    const client = createApiClient({ baseUrl: BASE, fetchImpl });
    const error = (await client.listProjects().catch((e) => e)) as ApiError;
    expect(error.kind).toBe('invalid_response');
    expect(error.retryable).toBe(false);
  });

  it('rejects a project list of the wrong shape', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ projects: 'nope' }));
    const client = createApiClient({ baseUrl: BASE, fetchImpl });
    const error = (await client.listProjects().catch((e) => e)) as ApiError;
    expect(error.kind).toBe('invalid_response');
  });

  it('rejects a malformed project record instead of inventing fields', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ project: { title: 'no id' } }, 201));
    const client = createApiClient({ baseUrl: BASE, fetchImpl });
    const error = (await client.createProject({ title: 'x' }).catch((e) => e)) as ApiError;
    expect(error.kind).toBe('invalid_response');
  });

  it('rejects a session without a subject', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ name: 'No sub' }));
    const client = createApiClient({ baseUrl: BASE, fetchImpl });
    const error = (await client.getSession().catch((e) => e)) as ApiError;
    expect(error.kind).toBe('invalid_response');
  });
});

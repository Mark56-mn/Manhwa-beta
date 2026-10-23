import { describe, expect, it } from 'bun:test';
import type { Env } from '../worker/src/env';
import { DuplicateTargetError, type ReplicationRecord } from '../worker/src/replication';
import {
  BackupNotConfiguredError,
  createSupabaseSecondaryTarget,
  supabaseTargetFromEnv,
  type BackupFetchLike
} from '../worker/src/supabaseBackup';

/**
 * Supabase backup adapter tests. No live project is configured, so every test
 * uses an injected fetch; nothing here claims a live backup works.
 */

const RECORD: ReplicationRecord = {
  table: 'projects',
  id: 'proj-1',
  organizationId: 'org-a',
  operation: 'upsert',
  payload: { id: 'proj-1', title: 'A', updated_at: '2026-10-23T00:00:00Z' },
  idempotencyKey: 'projects:proj-1:2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z'
};

const URL = 'https://project.supabase.co';
const KEY = 'service-role-key-for-tests';

function fakeFetch(response: Response | (() => Promise<Response>)): {
  fetchImpl: BackupFetchLike;
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: BackupFetchLike = async (url, init) => {
    calls.push({ url, init });
    return typeof response === 'function' ? response() : response;
  };
  return { fetchImpl, calls };
}

describe('configuration', () => {
  it('returns null when the backup is not configured', () => {
    expect(supabaseTargetFromEnv({} as Env)).toBeNull();
    expect(supabaseTargetFromEnv({ SUPABASE_URL: URL } as Env)).toBeNull();
  });

  it('refuses a non-https URL or an empty service-role key', () => {
    expect(() =>
      createSupabaseSecondaryTarget({ url: 'http://insecure.example', serviceRoleKey: KEY })
    ).toThrow(BackupNotConfiguredError);
    expect(() =>
      createSupabaseSecondaryTarget({ url: URL, serviceRoleKey: '   ' })
    ).toThrow(BackupNotConfiguredError);
  });
});

describe('apply', () => {
  it('upserts to the prefixed backup table with an idempotency key', async () => {
    const { fetchImpl, calls } = fakeFetch(new Response(null, { status: 201 }));
    const target = createSupabaseSecondaryTarget({ url: `${URL}/`, serviceRoleKey: KEY, fetchImpl });

    await target.apply(RECORD);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${URL}/rest/v1/backup_projects?on_conflict=id`);
    expect(calls[0].init.method).toBe('POST');

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Prefer).toBe('resolution=merge-duplicates,return=minimal');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(String(calls[0].init.body)) as Array<Record<string, unknown>>;
    expect(body).toEqual([
      {
        id: 'proj-1',
        organization_id: 'org-a',
        entity_table: 'projects',
        operation: 'upsert',
        payload: RECORD.payload,
        idempotency_key: RECORD.idempotencyKey,
        updated_at: RECORD.updatedAt
      }
    ]);
  });

  it('accepts a 204 without content', async () => {
    const { fetchImpl } = fakeFetch(new Response(null, { status: 204 }));
    const target = createSupabaseSecondaryTarget({ url: URL, serviceRoleKey: KEY, fetchImpl });
    await expect(target.apply(RECORD)).resolves.toBeUndefined();
  });

  it('maps 409 to DuplicateTargetError', async () => {
    const { fetchImpl } = fakeFetch(new Response(null, { status: 409 }));
    const target = createSupabaseSecondaryTarget({ url: URL, serviceRoleKey: KEY, fetchImpl });
    await expect(target.apply(RECORD)).rejects.toBeInstanceOf(DuplicateTargetError);
  });

  it('reports the HTTP status without leaking the service-role key', async () => {
    const { fetchImpl } = fakeFetch(new Response('permission denied', { status: 401 }));
    const target = createSupabaseSecondaryTarget({ url: URL, serviceRoleKey: KEY, fetchImpl });
    const error = (await target.apply(RECORD).catch((e) => e)) as Error;
    expect(error.message).toContain('HTTP 401');
    expect(error.message).not.toContain(KEY);
  });

  it('propagates a network failure without leaking the key', async () => {
    const fetchImpl: BackupFetchLike = async () => {
      throw new TypeError('network down');
    };
    const target = createSupabaseSecondaryTarget({ url: URL, serviceRoleKey: KEY, fetchImpl });
    const error = (await target.apply(RECORD).catch((e) => e)) as Error;
    expect(error.message).toBe('network down');
    expect(error.message).not.toContain(KEY);
  });

  it('turns a hanging request into an explicit timeout', async () => {
    const fetchImpl: BackupFetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      });
    const target = createSupabaseSecondaryTarget({
      url: URL,
      serviceRoleKey: KEY,
      fetchImpl,
      timeoutMs: 10
    });
    const error = (await target.apply(RECORD).catch((e) => e)) as Error;
    expect(error.message).toContain('timed out');
    expect(error.message).not.toContain(KEY);
  });
});

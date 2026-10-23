import type { Env } from './env';
import {
  DuplicateTargetError,
  type ReplicationRecord,
  type SecondaryTarget
} from './replication';

/**
 * Supabase Postgres as the SECONDARY backup target (never the primary).
 *
 * Writes through PostgREST with `Prefer: resolution=merge-duplicates` so a
 * replayed idempotency key is an upsert, and maps 409 to DuplicateTargetError.
 * The service-role key is server-side only: it is never returned, logged or
 * included in an error message. No live Supabase project is configured in this
 * task, so the adapter is verified against a fake fetch only.
 */

export interface BackupFetchLike {
  (input: string, init: RequestInit): Promise<Response>;
}

export interface SupabaseBackupConfig {
  url: string;
  serviceRoleKey: string;
  /** Backup tables are prefixed to keep them visibly separate from any other schema. */
  tablePrefix?: string;
  fetchImpl?: BackupFetchLike;
  timeoutMs?: number;
}

export class BackupNotConfiguredError extends Error {
  constructor(message = 'Supabase backup is not configured.') {
    super(message);
    this.name = 'BackupNotConfiguredError';
  }
}

/** Build the target, or return null when the backup is not configured. */
export function supabaseTargetFromEnv(env: Env): SecondaryTarget | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createSupabaseSecondaryTarget({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY
  });
}

export function createSupabaseSecondaryTarget(
  config: SupabaseBackupConfig
): SecondaryTarget {
  const baseUrl = config.url.trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new BackupNotConfiguredError('SUPABASE_URL must be an https URL.');
  }
  if (config.serviceRoleKey.trim().length === 0) {
    throw new BackupNotConfiguredError('SUPABASE_SERVICE_ROLE_KEY is empty.');
  }
  const tablePrefix = config.tablePrefix ?? 'backup_';
  const fetchImpl: BackupFetchLike =
    config.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = config.timeoutMs ?? 15_000;
  const serviceRoleKey = config.serviceRoleKey;

  return {
    name: 'supabase',

    async apply(record: ReplicationRecord): Promise<void> {
      const table = `${tablePrefix}${record.table}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(
          `${baseUrl}/rest/v1/${encodeURIComponent(table)}?on_conflict=id`,
          {
            method: 'POST',
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify([
              {
                id: record.id,
                organization_id: record.organizationId,
                entity_table: record.table,
                operation: record.operation,
                payload: record.payload,
                idempotency_key: record.idempotencyKey,
                updated_at: record.updatedAt
              }
            ]),
            signal: controller.signal
          }
        );

        if (response.status === 409) throw new DuplicateTargetError();
        if (!response.ok) {
          // Status only: response bodies and request headers can contain
          // deployment detail and must not reach logs or the client.
          throw new Error(`Supabase backup rejected the write (HTTP ${response.status}).`);
        }
      } catch (error) {
        if (error instanceof DuplicateTargetError) throw error;
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Supabase backup timed out after ${timeoutMs} ms.`);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

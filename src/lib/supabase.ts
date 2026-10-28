/**
 * Supabase client (TASK 11).
 *
 * One lazily created browser client, plus a narrow adapter onto the
 * `AuthGateway` seam that src/lib/authSession.ts is written against.
 *
 * Session storage: supabase-js persists the session (and refreshes it) in
 * browser storage. That is inherent to a bearer-token design — the access token
 * has to be somewhere the page can read it — and it is why the API treats every
 * token as untrusted and verifies it. What is never in this bundle is a
 * service-role/secret key: a value that looks like one is rejected before a
 * client is ever constructed (see src/lib/supabaseConfig.ts).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseConfig, type SupabaseConfig } from './supabaseConfig';
import type { AuthFailure, AuthGateway, AuthSession, AuthUser } from './authSession';

export type UnconfiguredSupabase = Exclude<SupabaseConfig, { kind: 'configured' }>;

export type SupabaseClientResult =
  | { ok: true; client: SupabaseClient; url: string }
  | { ok: false; config: UnconfiguredSupabase };

let cached: { url: string; key: string; client: SupabaseClient } | undefined;

/** The shared client, or the reason one cannot exist. Never throws. */
export function getSupabaseClient(): SupabaseClientResult {
  const config = resolveSupabaseConfig();
  if (config.kind !== 'configured') return { ok: false, config };

  if (!cached || cached.url !== config.url || cached.key !== config.key) {
    cached = {
      url: config.url,
      key: config.key,
      client: createClient(config.url, config.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // A password-recovery or confirmation link lands on this origin with
          // `?code=…`; supabase-js exchanges it for a session on load.
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      })
    };
  }

  return { ok: true, client: cached.client, url: config.url };
}

/** Reset the memoized client (deployments and tests never share a config). */
export function resetSupabaseClient(): void {
  cached = undefined;
}

function toUser(user: { id?: string; email?: string | null } | null | undefined): AuthUser | null {
  if (!user || typeof user.id !== 'string' || user.id.length === 0) return null;
  return { id: user.id, email: user.email ?? null };
}

function toSession(
  session: { access_token?: string; user?: { id?: string; email?: string | null } } | null | undefined
): AuthSession | null {
  if (!session || typeof session.access_token !== 'string' || session.access_token.length === 0) {
    return null;
  }
  const user = toUser(session.user);
  return user ? { accessToken: session.access_token, user } : null;
}

function toFailure(
  error: { message?: string; status?: number; code?: string } | null | undefined
): AuthFailure | null {
  if (!error) return null;
  return {
    message: typeof error.message === 'string' ? error.message : 'The authentication service failed.',
    status: typeof error.status === 'number' ? error.status : undefined,
    code: typeof error.code === 'string' ? error.code : undefined
  };
}

/**
 * Adapt the real client to `AuthGateway`. Returns null when the build has no
 * usable Supabase configuration, which the UI reports instead of guessing.
 */
export function supabaseAuthGateway(): AuthGateway | null {
  const result = getSupabaseClient();
  if (!result.ok) return null;
  const { auth } = result.client;

  return {
    async signUp({ email, password }) {
      const { data, error } = await auth.signUp({ email, password });
      return {
        session: toSession(data?.session),
        user: toUser(data?.user),
        error: toFailure(error)
      };
    },

    async signInWithPassword({ email, password }) {
      const { data, error } = await auth.signInWithPassword({ email, password });
      return { session: toSession(data?.session), error: toFailure(error) };
    },

    async signOut() {
      const { error } = await auth.signOut();
      return { error: toFailure(error) };
    },

    async getSession() {
      const { data, error } = await auth.getSession();
      return { session: toSession(data?.session), error: toFailure(error) };
    },

    async resetPasswordForEmail(email, redirectTo) {
      const { error } = await auth.resetPasswordForEmail(email, { redirectTo });
      return { error: toFailure(error) };
    },

    async updatePassword(password) {
      const { error } = await auth.updateUser({ password });
      return { error: toFailure(error) };
    }
  };
}

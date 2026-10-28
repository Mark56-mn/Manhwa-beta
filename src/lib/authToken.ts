/**
 * Bearer-token source for the API client (TASK 11).
 *
 * This is the only bridge between the Supabase session and `src/lib/api.ts`:
 * the client asks for the current access token per request and, on a 401,
 * for exactly one refresh. When the build has no Supabase configuration there
 * is no token, requests go out anonymous, and the API answers 401 — which the
 * UI reports as "signed out" rather than falling back to anything local.
 */

import type { AuthTokenProvider } from './api';
import { getSupabaseClient } from './supabase';

export const supabaseTokenProvider: AuthTokenProvider = {
  async getAccessToken(): Promise<string | null> {
    const result = getSupabaseClient();
    if (!result.ok) return null;
    try {
      const { data, error } = await result.client.auth.getSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  },

  async refreshAccessToken(): Promise<string | null> {
    const result = getSupabaseClient();
    if (!result.ok) return null;
    try {
      const { data, error } = await result.client.auth.refreshSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  }
};

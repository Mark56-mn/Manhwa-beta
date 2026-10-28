/**
 * Supabase Auth configuration (TASK 11).
 *
 * Both values are PUBLIC build-time configuration: Vite inlines every
 * `VITE_*` variable into the browser bundle. The publishable (or legacy anon)
 * key is designed to be public — it is not a password — but a service-role or
 * secret key in this file would hand full database access to any visitor, so a
 * value that looks like one is rejected outright rather than "used carefully".
 *
 * Resolution is explicit, like src/lib/apiConfig.ts:
 *  - both unset        -> `not_configured` (the UI says so)
 *  - one unset         -> `not_configured`, naming the missing variable
 *  - unusable value    -> `invalid`, with a reason and no guessing
 *  - usable pair       -> `configured`
 */

export const SUPABASE_URL_VAR = 'VITE_SUPABASE_URL';
export const SUPABASE_KEY_VAR = 'VITE_SUPABASE_PUBLISHABLE_KEY';
/** Supabase's previous public key name; still accepted, same key, same role. */
export const SUPABASE_LEGACY_KEY_VAR = 'VITE_SUPABASE_ANON_KEY';

export type SupabaseKeyKind = 'publishable' | 'legacy-anon' | 'secret' | 'unknown';

export type SupabaseConfig =
  | { kind: 'configured'; url: string; key: string; keyKind: 'publishable' | 'legacy-anon' }
  | { kind: 'not_configured'; missing: string[] }
  | { kind: 'invalid'; reason: string };

function readRaw(name: string): string {
  try {
    const env = (import.meta as { env?: Record<string, unknown> }).env;
    const value = env?.[name];
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

/** The configured project URL, raw and unvalidated. */
export function readSupabaseUrlRaw(): string {
  return readRaw(SUPABASE_URL_VAR);
}

/** The configured public key, raw and unvalidated. */
export function readSupabaseKeyRaw(): string {
  return readRaw(SUPABASE_KEY_VAR) || readRaw(SUPABASE_LEGACY_KEY_VAR);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const parsed: unknown = JSON.parse(atob(padded));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Classify a Supabase key. `secret` is the dangerous case: a `sb_secret_…`
 * key or any JWT whose `role` claim is `service_role` bypasses every row-level
 * policy and must never reach the browser.
 */
export function inspectKeyKind(raw: string): SupabaseKeyKind {
  const key = raw.trim();
  if (key.length === 0) return 'unknown';

  // Check the literal marker before parsing anything: a truncated or malformed
  // secret key must still be recognised as one.
  if (key.startsWith('sb_secret_') || /service_role/i.test(key)) return 'secret';

  if (key.startsWith('sb_publishable_')) return 'publishable';

  const payload = decodeJwtPayload(key);
  if (!payload) return 'unknown';
  if (payload.role === 'service_role') return 'secret';
  if (payload.role === 'anon') return 'legacy-anon';
  return 'unknown';
}

function normalizeProjectUrl(raw: string): { url: string } | { reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { reason: `${SUPABASE_URL_VAR} is not an absolute URL.` };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { reason: `${SUPABASE_URL_VAR} must use http(s).` };
  }
  if (parsed.username || parsed.password) {
    return { reason: `${SUPABASE_URL_VAR} must not embed credentials.` };
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return { reason: `${SUPABASE_URL_VAR} must be the project origin only, with no path.` };
  }
  const localhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
  if (parsed.protocol !== 'https:' && !localhost) {
    return { reason: `${SUPABASE_URL_VAR} must use https (http is only allowed for a local Supabase).` };
  }

  return { url: parsed.origin };
}

export function resolveSupabaseConfig(
  urlRaw: string = readSupabaseUrlRaw(),
  keyRaw: string = readSupabaseKeyRaw()
): SupabaseConfig {
  const url = urlRaw.trim();
  const key = keyRaw.trim();

  const missing: string[] = [];
  if (url.length === 0) missing.push(SUPABASE_URL_VAR);
  // The legacy anon key is accepted under its own name, so name whichever
  // variable the operator is expected to set.
  if (key.length === 0) {
    missing.push(readRaw(SUPABASE_LEGACY_KEY_VAR).length > 0 ? SUPABASE_LEGACY_KEY_VAR : SUPABASE_KEY_VAR);
  }
  if (missing.length > 0) return { kind: 'not_configured', missing };

  const normalized = normalizeProjectUrl(url);
  if ('reason' in normalized) return { kind: 'invalid', reason: normalized.reason };

  const keyKind = inspectKeyKind(key);
  if (keyKind === 'secret') {
    return {
      kind: 'invalid',
      reason:
        `${SUPABASE_KEY_VAR} contains a secret/service-role key. That key bypasses every row-level ` +
        'policy and must never be built into a browser bundle: rotate it in Supabase and use the publishable key.'
    };
  }
  if (keyKind === 'unknown') {
    return {
      kind: 'invalid',
      reason: `${SUPABASE_KEY_VAR} is not a Supabase publishable key (or a legacy anon JWT).`
    };
  }

  return { kind: 'configured', url: normalized.url, key, keyKind };
}

/** Human-readable guidance for a deployment that is not configured yet. */
export const SUPABASE_NOT_CONFIGURED_HINT =
  `Authentication is not configured for this build: set ${SUPABASE_URL_VAR} and ` +
  `${SUPABASE_KEY_VAR} (public values) in the hosting project and redeploy. ` +
  'Vite inlines them at build time, so an environment change only applies to a new deployment.';

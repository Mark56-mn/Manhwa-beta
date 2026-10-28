/**
 * Worker environment bindings (blueprint TASK 06/07 conventions).
 *
 * A binding is declared only once the resource exists and has been verified.
 * Narrow structural types are used so the worker typechecks without pulling
 * in a global workers-types configuration for the whole repository.
 */

export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
  all<T>(): Promise<T[]>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1StatementLike;
}

export interface R2ObjectLike {
  key: string;
  size: number;
  etag?: string;
  httpEtag?: string;
  version?: string;
  uploaded?: string;
  contentType?: string;
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBodyLike {
  body: ReadableStream | null;
  size: number;
  etag?: string;
  httpEtag?: string;
  version?: string;
  contentType?: string;
}

export interface R2BucketLike {
  head(key: string): Promise<R2ObjectLike | null>;
  get(key: string, options?: { range?: string }): Promise<R2ObjectBodyLike | R2ObjectLike | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: {
    httpMetadata?: { contentType?: string; cacheControl?: string; contentDisposition?: string; contentEncoding?: string; contentLanguage?: string };
    customMetadata?: Record<string, string>;
  }): Promise<R2ObjectLike | null>;
  delete(key: string | string[]): Promise<void>;
}

export interface Env {
  /** D1 database binding — created and migrated in TASK 07. */
  DB?: D1DatabaseLike;
  /** R2 bucket binding — created + verified in TASK 12 (bucket `manhwa-studio-assets`). */
  FILES?: R2BucketLike;

  /**
   * Supabase project URL (PUBLIC, e.g. `https://abcd.supabase.co`). The API
   * verifies Supabase Auth access tokens against this project's published
   * JWKS; it is also the optional secondary backup target. A bare http(s)
   * origin only — a path/query makes it unusable (never patched up).
   */
  SUPABASE_URL?: string;

  /**
   * Legacy HS256 verification secret (the project's JWT secret). SECRET: set
   * with `wrangler secret put` only, never in [vars], never in a VITE_
   * variable. Modern projects sign access tokens with ES256 and need no
   * secret at all — leave this unset unless the project still issues HS256.
   */
  SUPABASE_JWT_SECRET?: string;

  /**
   * This API's own origin: the first CORS allow-list entry, and what the
   * same-origin mutation guard compares against. Public, never derived from a
   * request Host header.
   */
  APP_ORIGIN?: string;

  /**
   * Additional exact origins allowed to call this API cross-origin (the second
   * host, e.g. a Vercel build). Comma-separated, public configuration only.
   * APP_ORIGIN is always included. Never `*` — credentialed CORS requires a
   * concrete origin. See worker/src/origins.ts.
   */
  ALLOWED_ORIGINS?: string;

  /**
   * Supabase backup target (secondary only — never the primary database).
   * Server-side only; SUPABASE_SERVICE_ROLE_KEY is a secret and must never be
   * exposed to the browser, nor used for token verification. When absent,
   * backup is `not_configured`.
   */
  SUPABASE_SERVICE_ROLE_KEY?: string;

  /**
   * Server-side AI provider (TASK 04). Secrets are Worker bindings/secrets only
   * and are never returned, logged or placed in a job record. Both the key and
   * an explicit model are required; otherwise generation answers an honest
   * `provider_not_configured` and nothing is charged.
   */
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  /** Bounded provider request timeout and output limit (milliseconds/tokens). */
  AI_TIMEOUT_MS?: string;
  AI_MAX_OUTPUT_TOKENS?: string;
}

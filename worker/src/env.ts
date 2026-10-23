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
   * Sign in with Freebuff (public configuration, not secrets; no client
   * secret exists). Minted by the project owner via `npx @freebuff/auth
   * register` or Freebuff Desktop — never invented by this codebase.
   */
  FREEBUFF_CLIENT_ID?: string;
  FREEBUFF_ISSUER?: string;
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
   * exposed to the browser. When either is absent, backup is `not_configured`.
   */
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

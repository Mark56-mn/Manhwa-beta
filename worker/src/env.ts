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
   * TEST-ONLY escape hatch. When set, asset routes use this user instead of
   * calling setupAuth.getUser(). Never set in production — it exists so the
   * TASK-12 asset tests can run against a mock user without a real Freebuff
   * session. Production deployments never populate this field.
   */
  AUTH_USER_OVERRIDE?: { sub: string; name?: string | null };
}

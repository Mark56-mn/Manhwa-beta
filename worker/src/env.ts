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
}

export interface D1DatabaseLike {
  prepare(sql: string): D1StatementLike;
}

export interface R2BucketLike {
  head(key: string): Promise<unknown>;
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
}

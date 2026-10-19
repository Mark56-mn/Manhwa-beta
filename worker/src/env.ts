/**
 * Worker environment bindings (blueprint TASK 06 conventions).
 *
 * A binding is declared only once the resource exists and has been verified.
 * Narrow structural types are used so the worker typechecks without pulling
 * in a global workers-types configuration for the whole repository.
 */

export interface D1DatabaseLike {
  prepare(sql: string): { first<T>(): Promise<T | null> };
}

export interface R2BucketLike {
  head(key: string): Promise<unknown>;
}

export interface Env {
  /** D1 database binding — attached in TASK 07 once the database exists. */
  DB?: D1DatabaseLike;
  /** R2 bucket binding — attached in TASK 12 (API token currently lacks R2 scope). */
  FILES?: R2BucketLike;
}

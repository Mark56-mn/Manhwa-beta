import { Database } from 'bun:sqlite';
import type { D1DatabaseLike, D1StatementLike } from '../../worker/src/env';

/**
 * A real-SQLite D1 adapter for route tests.
 *
 * The routes are exercised against the actual migration files rather than a
 * hand-rolled row matcher, so tenant scoping is proven by the same SQL that
 * production D1 executes.
 */

type SqlValue = string | number | bigint | null | Uint8Array;

export function createSqliteD1(db: Database): D1DatabaseLike {
  return {
    prepare(sql: string): D1StatementLike {
      let params: SqlValue[] = [];

      const statement: D1StatementLike = {
        bind(...values: unknown[]): D1StatementLike {
          params = values.map((value) => {
            if (value === undefined) return null;
            return value as SqlValue;
          });
          return statement;
        },
        async first<T>(): Promise<T | null> {
          const row = db.query(sql).get(...(params as never[]));
          return (row ?? null) as T | null;
        },
        async all<T>(): Promise<T[]> {
          return db.query(sql).all(...(params as never[])) as T[];
        },
        async run(): Promise<unknown> {
          const result = db.query(sql).run(...(params as never[]));
          // Mirror D1's { success, meta: { changes } } shape so services can
          // detect whether a conditional UPDATE actually won.
          return { success: true, meta: { changes: result.changes } };
        }
      };

      return statement;
    }
  };
}

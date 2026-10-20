import { describe, expect, it } from 'bun:test';
import type { Env } from '../worker/src/env';

// Minimal in-memory D1 shim used by these tests.
// D1 is SQLite; this is a plain JS map that mimics the subset our asset
// routes call: prepare(sql).bind(...).first<T>() / all<T>() / run().
type Row = Record<string, unknown>;
type Param = string | number;

class InMemoryDB {
  tables: Record<string, Row[]> = {};
  constructor(seed?: Record<string, Row[]>) {
    if (seed) this.tables = seed;
  }
  prepare(sql: string): InMemoryStatement {
    return new InMemoryStatement(sql, this);
  }
}

class InMemoryStatement {
  private sql: string;
  private params: Param[] = [];
  private db: InMemoryDB;
  constructor(sql: string, db: InMemoryDB) {
    this.sql = sql;
    this.db = db;
  }
  bind(...values: unknown[]): InMemoryStatement {
    this.params = values.map((v) => (typeof v === 'bigint' ? Number(v) : v)) as Param[];
    return this;
  }
  run(): Promise<unknown> {
    this.apply();
    return Promise.resolve({});
  }
  private apply(): void {
    const lower = this.sql.trim().toLowerCase();
    if (lower.startsWith('insert into ')) {
      const table = /insert\s+into\s+(\w+)/i.exec(this.sql)?.[1];
      if (table && this.db.tables[table]) {
        const cols = /\(\s*([^)]+)\s*\)/i.exec(this.sql);
        const colList = cols ? cols[1].split(',').map((c) => c.trim()) : [];
        let paramValues = this.params;
        if (paramValues.length === 0) {
          paramValues = this.parseValuesLiterals(this.sql) as Param[];
        }
        const row: Record<string, unknown> = {};
        for (let i = 0; i < colList.length; i++) {
          const col = colList[i].toLowerCase() as string;
          const v = paramValues[i];
          if (typeof v === 'object' && v !== null) {
            const bv = (v as { byteLength?: number }).byteLength;
            if (typeof bv === 'number' && bv >= 0) {
              row[col] = `<binary ${bv} bytes>`;
            } else {
              row[col] = v;
            }
          } else if (v === null || v === undefined) {
            row[col] = null;
          } else {
            row[col] = typeof v === 'bigint' ? Number(v) : v;
          }
        }
        this.db.tables[table].push(row);
      }
    } else if (lower.startsWith('delete from ')) {
      const table = /delete\s+from\s+(\w+)/i.exec(this.sql)?.[1];
      if (table && this.db.tables[table] && this.db.tables[table] instanceof Array) {
        const rows = this.db.tables[table] as Row[];
        const where = /where\s+(.+)$/i.exec(this.sql);
        if (where) {
          const cond = where[1];
          let idx = 0;
          this.db.tables[table] = rows.filter((r) => {
            const conds = cond.split(/\s+and\s+/i);
            return !conds.every((c) => String(r[c.trim().split(/\s+/i)[0]] ?? '') === String(this.params[idx++] ?? ''));
          });
        } else {
          this.db.tables[table] = [];
        }
      }
    }
  }
  private matchRowCondition(row: Row, cond: string, nextParam: () => string): boolean {
    const eq = /^\s*(\w+)\s*=\s*\?\s*$/i.exec(cond);
    if (eq) {
      const col = eq[1];
      return String(row[col] ?? '') === nextParam();
    }
    const inC = /^\s*(\w+)\s+in\s*\(\s*\?\s*\)\s*$/i.exec(cond);
    if (inC) {
      const col = inC[1];
      return String(row[col] ?? '') === nextParam();
    }
    const m = cond.match(/^\s*(.+?)\s+in\s*\(\s*\?\s*\)\s*$/i);
    if (m) {
      const col = m[1];
      return String(row[col] ?? '') === nextParam();
    }
    return true;
  }
  async first<T>(): Promise<T | null> {
    const rows = this.rows();
    return (rows[0] ?? null) as T | null;
  }
  async all<T>(): Promise<T[]> {
    const rows = this.rows();
    return rows as unknown as T[];
  }
  private rows(): Row[] {
    const sql = this.sql.trim();
    if (!/^select\b/i.test(sql)) return [];
    const table = /from\s+(\w+)/i.exec(sql)?.[1];
    if (!table || !this.db.tables[table]) {
            // no-op
      return [];
    }
    let rows = this.db.tables[table].slice();
    const where = /where\s+(.+)$/i.exec(sql);
    if (where) {
      const cond = where[1];
      rows = rows.filter((r) => this.matchesWhere(r, cond));
    }
    return rows;
  }
  private paramsIdx = 0;
  private matchesWhere(row: Row, cond: string): boolean {
    this.paramsIdx = 0;
    const conds = cond.split(/\s+and\s+/i);
    return conds.every((c) => this.matchesCondition(row, c.trim()));
  }
  private matchesCondition(row: Row, cond: string): boolean {
    const eq = /^\s*(\w+)\s*=\s*\?\s*$/i.exec(cond);
    if (eq) {
      const col = eq[1];
      const paramIdx = this.paramsIdx++;
      const val: string = String(this.params[paramIdx] ?? '');
      const rowVal = String(row[col] ?? '');
      return rowVal === val;
    }
    const inC = /^\s*(\w+)\s+in\s*\(\s*\?\s*\)\s*$/i.exec(cond);
    if (inC) {
      const col = inC[1];
      const paramIdx = this.paramsIdx++;
      const val: string = String(this.params[paramIdx] ?? '');
      const rowVal = String(row[col] ?? '');
      return rowVal === val;
    }
    const m = cond.match(/^\s*(.+?)\s+in\s*\(\s*\?\s*\)\s*$/i);
    if (m) {
      const col = m[1];
      const paramIdx = this.paramsIdx++;
      const val: string = String(this.params[paramIdx] ?? '');
      const rowVal = String(row[col] ?? '');
      return rowVal === val;
    }
    return true;
  }
  private parseValuesLiterals(sql: string): unknown[] {
    const m = /\bvalues\s*\(\s*([^)]*)\s*\)\s*$/i.exec(sql);
    if (!m) return [];
    const body = m[1];
    const vals: unknown[] = [];
    let i = 0;
    while (i < body.length) {
      const ch = body[i];
      if (ch === "'") {
        const end = body.indexOf("'", i + 1);
        if (end === -1) break;
        vals.push(body.slice(i + 1, end));
        i = end + 1;
      } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
        let j = i + 1;
        while (j < body.length && (body[j] === '.' || body[j] === 'e' || body[j] === 'E' || body[j] === '+' || body[j] === '-' || (body[j] >= '0' && body[j] <= '9'))) {
          j++;
        }
        const num = body.slice(i, j);
        if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(num)) {
          vals.push(/\.\d/.test(num) || /[eE]/.test(num) ? parseFloat(num) : parseInt(num, 10));
        } else {
          vals.push(num);
        }
        i = j;
      } else if (body.slice(i, i + 4).toUpperCase() === 'NULL') {
        vals.push(null);
        i += 4;
      } else {
        i++;
      }
      while (i < body.length && (body[i] === ',' || body[i] === ' ' || body[i] === '\t' || body[i] === '\n' || body[i] === '\r')) {
        i++;
      }
    }
    return vals;
  }
}

interface R2ObjectLike {
  key: string;
  size: number;
  etag?: string;
  httpEtag?: string;
  version?: string;
  uploaded?: string;
  contentType?: string;
  customMetadata?: Record<string, string>;
}

interface R2ObjectBodyLike {
  body: ReadableStream | null;
  size: number;
  etag?: string;
  httpEtag?: string;
  version?: string;
  contentType?: string;
}

class MockR2Bucket {
  objects = new Map<string, { body: ReadableStream | null; size: number; etag: string; contentType: string }>();
  head(key: string): Promise<R2ObjectLike | null> {
    const o = this.objects.get(key);
    if (!o) return Promise.resolve(null);
    return Promise.resolve({ key, size: o.size, etag: o.etag, contentType: o.contentType });
  }
  async get(key: string): Promise<R2ObjectBodyLike | R2ObjectLike | null> {
    const o = this.objects.get(key);
    if (!o) return null;
    return { body: null, size: o.size, etag: o.etag, httpEtag: o.etag, contentType: o.contentType };
  }
  async put(_key: string, value: ArrayBuffer | ReadableStream | string | null, options?: {
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
  }): Promise<R2ObjectLike | null> {
    const bytes =
      value instanceof ArrayBuffer
        ? value.byteLength
        : typeof value === 'string'
          ? new TextEncoder().encode(value).byteLength
          : 0;
    const etag = `etag-${Math.random().toString(36).slice(2, 9)}`;
    this.objects.set(_key, {
      body: null,
      size: bytes,
      etag,
      contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream',
    });
    return { key: _key, size: bytes, etag, httpEtag: etag };
  }
  async delete(key: string | string[]): Promise<void> {
    if (typeof key === 'string') this.objects.delete(key);
    else key.forEach((k) => this.objects.delete(k));
  }
}

function makeEnv(d1?: InMemoryDB, files?: MockR2Bucket, user?: { sub: string; name?: string | null }): Env {
  const db = d1 ?? new InMemoryDB({
    organizations: [],
    users: [],
    organization_memberships: [],
    projects: [],
    assets: [],
    audit_events: [],
  });
  const r2 = files ?? new MockR2Bucket();
  return {
    DB: db as unknown as Env['DB'],
    FILES: r2 as unknown as Env['FILES'],
    FREEBUFF_CLIENT_ID: 'cli-test',
    FREEBUFF_ISSUER: 'https://freebuff.test',
    APP_ORIGIN: 'http://localhost:8788',
    ...(user ? { AUTH_USER_OVERRIDE: user } : {}),
  } as Env;
}

const assetApp = require('../worker/src/assets').default;

describe('asset routes (TASK 12)', () => {
  it('returns 503 not_configured when FILES binding is missing', async () => {
    const env = makeEnv(undefined, undefined);
    Reflect.deleteProperty(env, 'FILES');
    const req = new Request('http://localhost/api/v1/assets', { method: 'GET' });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe('not_configured');
  });

  it('returns 503 auth_not_configured when Freebuff client is not configured', async () => {
    const env = makeEnv(undefined, undefined);
    Reflect.deleteProperty(env, 'FREEBUFF_CLIENT_ID');
    const req = new Request('http://localhost/api/v1/assets', { method: 'GET' });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe('auth_not_configured');
  });

  it('returns 401 when no authenticated user', async () => {
    const env = makeEnv();
    const req = new Request('http://localhost/api/v1/assets', { method: 'GET' });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('unauthorized');
  });

  it('returns 404 when asset id is unknown', async () => {
    const env = makeEnv(undefined, undefined, { sub: 'sub-1', name: 'User' });
    env.DB!.prepare(`INSERT INTO users (id, display_name) VALUES ('sub-1', 'User')`).run();
    env.DB!.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m1', 'org-1', 'sub-1', 'member')`
    ).run();
    // asset does not exist
    const req = new Request('http://localhost/api/v1/assets/does-not-exist', {
      headers: { Origin: 'http://localhost:8788' },
    });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(404);
  });

  it('returns 403 when asset belongs to a different organization', async () => {
    const env = makeEnv(undefined, undefined, { sub: 'sub-1', name: 'User' });
    env.DB!.prepare(`INSERT INTO users (id, display_name) VALUES ('sub-1', 'User')`).run();
    env.DB!.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-a', 'Org A', 'org-a')`).run();
    env.DB!.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-b', 'Org B', 'org-b')`).run();
    env.DB!.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('ma', 'org-a', 'sub-1', 'member')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO projects (id, organization_id, title, status) VALUES ('proj-b', 'org-b', 'Proj B', 'draft')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO assets (id, organization_id, project_id, r2_key, filename, content_type, size, etag, created_by_sub)
       VALUES ('asset-b', 'org-b', 'proj-b', 'org/org-b/proj/proj-b/asset/asset-b/asset-b.png', 'cover.png', 'image/png', 100, 'abc', 'sub-1')`
    ).run();
    // put a real object in the mock R2 bucket so the GET doesn't 404 on the object
    (env.FILES as MockR2Bucket).objects.set('org/org-b/proj/proj-b/asset/asset-b/asset-b.png', {
      body: null,
      size: 100,
      etag: 'abc',
      contentType: 'image/png',
    });

    const req = new Request('http://localhost/api/v1/assets/asset-b', {
      headers: { Origin: 'http://localhost:8788' },
    });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('forbidden');
  });

  it('lists assets scoped to the caller organization', async () => {
    const env = makeEnv(undefined, undefined, { sub: 'sub-1', name: 'User' });
    env.DB!.prepare(`INSERT INTO users (id, display_name) VALUES ('sub-1', 'User')`).run();
    env.DB!.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-1', 'Org', 'org-1')`).run();
    env.DB!.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m1', 'org-1', 'sub-1', 'member')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO projects (id, organization_id, title, status) VALUES ('proj-1', 'org-1', 'Proj', 'draft')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO assets (id, organization_id, project_id, r2_key, filename, content_type, size, etag, created_by_sub)
       VALUES ('a1', 'org-1', 'proj-1', 'org/org-1/proj/proj-1/asset/a1/a1.png', 'a.png', 'image/png', 10, 'e1', 'sub-1')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO assets (id, organization_id, project_id, r2_key, filename, content_type, size, etag, created_by_sub)
       VALUES ('a2', 'org-1', 'proj-1', 'org/org-1/proj/proj-1/asset/a2/a2.png', 'b.png', 'image/png', 20, 'e2', 'sub-1')`
    ).run();

    const req = new Request('http://localhost/api/v1/assets', {
      headers: { Origin: 'http://localhost:8788' },
    });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.assets)).toBe(true);
    expect(json.assets.map((a: { id: string }) => a.id).sort()).toEqual(['a1', 'a2']);
  });

  it('creates an asset and records it in D1 + R2 (round-trip)', async () => {
    const env = makeEnv(undefined, undefined, { sub: 'sub-1', name: 'User' });
    env.DB!.prepare(`INSERT INTO users (id, display_name) VALUES ('sub-1', 'User')`).run();
    env.DB!.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-1', 'Org', 'org-1')`).run();
    env.DB!.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m1', 'org-1', 'sub-1', 'member')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO projects (id, organization_id, title, status) VALUES ('proj-1', 'org-1', 'Proj', 'draft')`
    ).run();

    const body = new TextEncoder().encode('hello asset');
    const req = new Request('http://localhost/api/v1/assets', {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        'X-Project-Id': 'proj-1',
        'X-Filename': 'hello.txt',
        Origin: 'http://localhost:8788',
      },
      body,
    });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBeDefined();
    expect(json.filename).toBe('hello.txt');
    expect(json.content_type).toBe('text/plain');
    expect(json.size).toBe(11);
    expect(json.etag).toBeDefined();

    // verify D1 record
    const row = await env.DB!.prepare(`SELECT * FROM assets WHERE id = ?`).bind(json.id).first<{
      r2_key: string;
      filename: string;
      content_type: string;
      size: number;
      etag: string | null;
      created_by_sub: string;
    } | null>();
    expect(row).not.toBeNull();
    expect(row!.filename).toBe('hello.txt');
    expect(row!.content_type).toBe('text/plain');
    expect(row!.created_by_sub).toBe('sub-1');

    // verify R2 object
    const r2 = env.FILES as MockR2Bucket;
    const stored = r2.objects.get(row!.r2_key);
    expect(stored).toBeDefined();
    expect(stored!.size).toBe(11);
  });

  it('rejects asset creation when project does not belong to the caller organization', async () => {
    const env = makeEnv(undefined, undefined, { sub: 'sub-1', name: 'User' });
    env.DB!.prepare(`INSERT INTO users (id, display_name) VALUES ('sub-1', 'User')`).run();
    env.DB!.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-1', 'Org', 'org-1')`).run();
    env.DB!.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m1', 'org-1', 'sub-1', 'member')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO projects (id, organization_id, title, status) VALUES ('proj-other', 'org-other', 'Other', 'draft')`
    ).run();

    const req = new Request('http://localhost/api/v1/assets', {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        'X-Project-Id': 'proj-other',
        Origin: 'http://localhost:8788',
      },
      body: new TextEncoder().encode('x'),
    });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('bad_request');
  });

  it('rejects asset creation with disallowed content type', async () => {
    const env = makeEnv(undefined, undefined, { sub: 'sub-1', name: 'User' });
    env.DB!.prepare(`INSERT INTO users (id, display_name) VALUES ('sub-1', 'User')`).run();
    env.DB!.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-1', 'Org', 'org-1')`).run();
    env.DB!.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m1', 'org-1', 'sub-1', 'member')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO projects (id, organization_id, title, status) VALUES ('proj-1', 'org-1', 'Proj', 'draft')`
    ).run();

    const req = new Request('http://localhost/api/v1/assets', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/x-unsallowed',
        'X-Project-Id': 'proj-1',
        Origin: 'http://localhost:8788',
      },
      body: new TextEncoder().encode('x'),
    });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('bad_request');
    expect(json.detail).toContain('Content-Type not allowed');
  });

  it('rejects asset creation larger than the application limit', async () => {
    const env = makeEnv(undefined, undefined, { sub: 'sub-1', name: 'User' });
    env.DB!.prepare(`INSERT INTO users (id, display_name) VALUES ('sub-1', 'User')`).run();
    env.DB!.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-1', 'Org', 'org-1')`).run();
    env.DB!.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m1', 'org-1', 'sub-1', 'member')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO projects (id, organization_id, title, status) VALUES ('proj-1', 'org-1', 'Proj', 'draft')`
    ).run();
    const big = 'x'.repeat(10 * 1024 * 1024 + 1);
    const req = new Request('http://localhost/api/v1/assets', {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        'X-Project-Id': 'proj-1',
        Origin: 'http://localhost:8788',
      },
      body: big,
    });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toBe('payload_too_large');
  });

  it('deletes an asset from D1 and R2', async () => {
    const env = makeEnv(undefined, undefined, { sub: 'sub-1', name: 'User' });
    env.DB!.prepare(`INSERT INTO users (id, display_name) VALUES ('sub-1', 'User')`).run();
    env.DB!.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-1', 'Org', 'org-1')`).run();
    env.DB!.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m1', 'org-1', 'sub-1', 'member')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO projects (id, organization_id, title, status) VALUES ('proj-1', 'org-1', 'Proj', 'draft')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO assets (id, organization_id, project_id, r2_key, filename, content_type, size, etag, created_by_sub)
       VALUES ('asset-d', 'org-1', 'proj-1', 'org/org-1/proj/proj-1/asset/asset-d/asset-d.png', 'd.png', 'image/png', 10, 'e', 'sub-1')`
    ).run();
    (env.FILES as MockR2Bucket).objects.set('org/org-1/proj/proj-1/asset/asset-d/asset-d.png', {
      body: null,
      size: 10,
      etag: 'e',
      contentType: 'image/png',
    });

    const req = new Request('http://localhost/api/v1/assets/asset-d', {
      method: 'DELETE',
      headers: { Origin: 'http://localhost:8788' },
    });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe('asset-d');
    expect((env.FILES as MockR2Bucket).objects.has('org/org-1/proj/proj-1/asset/asset-d/asset-d.png')).toBe(false);

    const rows_after = await env.DB!.prepare(`SELECT id, organization_id FROM assets`).all();
    expect(rows_after).toEqual([]);
  });

  it('rejects DELETE when the asset belongs to another organization', async () => {
    const env = makeEnv(undefined, undefined, { sub: 'sub-1', name: 'User' });
    env.DB!.prepare(`INSERT INTO users (id, display_name) VALUES ('sub-1', 'User')`).run();
    env.DB!.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-a', 'A', 'org-a')`).run();
    env.DB!.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-b', 'B', 'org-b')`).run();
    env.DB!.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('ma', 'org-a', 'sub-1', 'member')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO projects (id, organization_id, title, status) VALUES ('proj-b', 'org-b', 'B', 'draft')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO assets (id, organization_id, project_id, r2_key, filename, content_type, size, etag, created_by_sub)
       VALUES ('asset-b', 'org-b', 'proj-b', 'org/org-b/proj/proj-b/asset/asset-b/asset-b.png', 'b.png', 'image/png', 10, 'e', 'sub-1')`
    ).run();

    const req = new Request('http://localhost/api/v1/assets/asset-b', {
      method: 'DELETE',
      headers: { Origin: 'http://localhost:8788' },
    });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('forbidden');
  });

  it('rejects asset creation from a non-app origin (same-origin guard)', async () => {
    const env = makeEnv(undefined, undefined, { sub: 'sub-1', name: 'User' });
    env.DB!.prepare(`INSERT INTO users (id, display_name) VALUES ('sub-1', 'User')`).run();
    env.DB!.prepare(`INSERT INTO organizations (id, name, slug) VALUES ('org-1', 'Org', 'org-1')`).run();
    env.DB!.prepare(
      `INSERT INTO organization_memberships (id, organization_id, user_sub, role) VALUES ('m1', 'org-1', 'sub-1', 'member')`
    ).run();
    env.DB!.prepare(
      `INSERT INTO projects (id, organization_id, title, status) VALUES ('proj-1', 'org-1', 'Proj', 'draft')`
    ).run();

    const req = new Request('http://localhost/api/v1/assets', {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        'X-Project-Id': 'proj-1',
        Origin: 'https://evil.example',
      },
      body: new TextEncoder().encode('x'),
    });
    const res = await assetApp.fetch(req, env) as Response;
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('forbidden');
    expect(json.detail).toContain('app origin');
  });
});

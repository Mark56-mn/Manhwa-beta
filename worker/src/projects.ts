import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from './env';
import { authConfigured } from './auth';
import { resolveFreebuffUser, type AuthenticatedUser, type UserResolver } from './identity';
import { firstOrganizationForUser } from './tenancy';
import { isAllowedMutationOrigin } from './origins';

/**
 * Projects API (TASK-IMPLEMENT-SHARED-FOUNDATION).
 *
 * The first real frontend-to-backend workflow: list and create (plus read,
 * update, delete) projects stored in the authoritative D1 database.
 *
 * Security model, applied on every route:
 *  - no identity provider configured       -> 503 auth_not_configured
 *  - no D1 binding                          -> 503 not_configured
 *  - mutation without an allow-listed Origin -> 403
 *  - missing/invalid session                 -> 401
 *  - authenticated but no organization       -> 403
 *  - every SQL statement is scoped to the organization derived from the
 *    verified session `sub`; a client-supplied organization/user id is ignored
 *  - another tenant's project id answers 404 (no existence leak, no access)
 *
 * Responses are never cached and never echo another tenant's data.
 */

export const PROJECT_STATUSES = ['draft', 'in_production', 'approved', 'published'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectRow {
  id: string;
  organization_id: string;
  title: string;
  genre: string | null;
  status: ProjectStatus;
  created_by_sub: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicProject {
  id: string;
  title: string;
  genre: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectsDeps {
  /** Production default verifies the Freebuff session; tests inject a double. */
  resolveUser: UserResolver;
}

const MAX_TITLE_LENGTH = 200;
const MAX_GENRE_LENGTH = 80;

function isoTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function toPublicProject(row: ProjectRow): PublicProject {
  return {
    id: row.id,
    title: row.title,
    genre: row.genre ?? null,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) return null;
  return title;
}

function cleanGenre(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const genre = value.trim();
  if (genre.length === 0) return { ok: true, value: null };
  if (genre.length > MAX_GENRE_LENGTH) return { ok: false };
  return { ok: true, value: genre };
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
}

type Access =
  | { ok: true; user: AuthenticatedUser; organizationId: string }
  | { ok: false; response: Response };

export function createProjectsApp(
  deps: ProjectsDeps = { resolveUser: resolveFreebuffUser }
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    await next();
  });

  /** Shared authorization gate. Always resolve tenant scope from the session. */
  async function authorize(c: Context<{ Bindings: Env }>, mutation: boolean): Promise<Access> {
    if (!authConfigured(c.env)) {
      return {
        ok: false,
        response: c.json(
          {
            error: 'auth_not_configured',
            detail: 'No identity provider client is configured on this deployment.'
          },
          503
        )
      };
    }
    if (!c.env.DB) {
      return {
        ok: false,
        response: c.json({ error: 'not_configured', detail: 'D1 binding not attached.' }, 503)
      };
    }
    if (mutation && !isAllowedMutationOrigin(c.req.raw, c.env)) {
      return {
        ok: false,
        response: c.json(
          {
            error: 'forbidden',
            detail: 'Mutations only allowed from an allow-listed app origin.'
          },
          403
        )
      };
    }

    const user = await deps.resolveUser(c.req.raw, c.env);
    if (!user) {
      return { ok: false, response: c.json({ error: 'unauthorized' }, 401) };
    }

    const organizationId = await firstOrganizationForUser(c.env, user.sub);
    if (!organizationId) {
      return {
        ok: false,
        response: c.json(
          { error: 'forbidden', detail: 'Not a member of any organization.' },
          403
        )
      };
    }

    return { ok: true, user, organizationId };
  }

  async function findProject(env: Env, organizationId: string, projectId: string) {
    return env.DB!.prepare(
      `SELECT id, organization_id, title, genre, status, created_by_sub, created_at, updated_at
       FROM projects WHERE id = ? AND organization_id = ?`
    )
      .bind(projectId, organizationId)
      .first<ProjectRow | null>();
  }

  app.get('/api/v1/projects', async (c) => {
    const access = await authorize(c, false);
    if (!access.ok) return access.response;

    const rows = (await c.env.DB!.prepare(
      `SELECT id, organization_id, title, genre, status, created_by_sub, created_at, updated_at
       FROM projects WHERE organization_id = ? ORDER BY updated_at DESC, id DESC`
    )
      .bind(access.organizationId)
      .all<ProjectRow>()) as unknown as ProjectRow[];

    return c.json({ projects: (rows ?? []).map(toPublicProject) });
  });

  app.get('/api/v1/projects/:id', async (c) => {
    const access = await authorize(c, false);
    if (!access.ok) return access.response;

    const row = await findProject(c.env, access.organizationId, c.req.param('id'));
    if (!row) return c.json({ error: 'not_found', detail: 'Project not found.' }, 404);
    return c.json({ project: toPublicProject(row) });
  });

  app.post('/api/v1/projects', async (c) => {
    const access = await authorize(c, true);
    if (!access.ok) return access.response;

    const body = await readJsonObject(c.req.raw);
    if (!body) {
      return c.json({ error: 'bad_request', detail: 'Expected a JSON object body.' }, 400);
    }
    const title = cleanTitle(body.title);
    if (!title) {
      return c.json(
        { error: 'bad_request', detail: `title is required (1-${MAX_TITLE_LENGTH} characters).` },
        400
      );
    }
    const genre = cleanGenre(body.genre);
    if (!genre.ok) {
      return c.json(
        { error: 'bad_request', detail: `genre must be at most ${MAX_GENRE_LENGTH} characters.` },
        400
      );
    }

    const id = `proj-${crypto.randomUUID()}`;
    const now = isoTimestamp();
    await c.env.DB!.prepare(
      `INSERT INTO projects (id, organization_id, title, genre, status, created_by_sub, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`
    )
      .bind(id, access.organizationId, title, genre.value, access.user.sub, now, now)
      .run();

    const created = await findProject(c.env, access.organizationId, id);
    if (!created) {
      return c.json({ error: 'write_failed', detail: 'Project could not be read back after insert.' }, 500);
    }
    return c.json({ project: toPublicProject(created) }, 201);
  });

  app.patch('/api/v1/projects/:id', async (c) => {
    const access = await authorize(c, true);
    if (!access.ok) return access.response;

    const existing = await findProject(c.env, access.organizationId, c.req.param('id'));
    if (!existing) return c.json({ error: 'not_found', detail: 'Project not found.' }, 404);

    const body = await readJsonObject(c.req.raw);
    if (!body) {
      return c.json({ error: 'bad_request', detail: 'Expected a JSON object body.' }, 400);
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.title !== undefined) {
      const title = cleanTitle(body.title);
      if (!title) {
        return c.json(
          { error: 'bad_request', detail: `title must be 1-${MAX_TITLE_LENGTH} characters.` },
          400
        );
      }
      updates.push('title = ?');
      values.push(title);
    }

    if (body.genre !== undefined) {
      const genre = cleanGenre(body.genre);
      if (!genre.ok) {
        return c.json(
          { error: 'bad_request', detail: `genre must be at most ${MAX_GENRE_LENGTH} characters.` },
          400
        );
      }
      updates.push('genre = ?');
      values.push(genre.value);
    }

    if (body.status !== undefined) {
      if (!isProjectStatus(body.status)) {
        return c.json(
          { error: 'bad_request', detail: `status must be one of: ${PROJECT_STATUSES.join(', ')}.` },
          400
        );
      }
      updates.push('status = ?');
      values.push(body.status);
    }

    if (updates.length === 0) {
      return c.json(
        { error: 'bad_request', detail: 'No updatable field supplied (title, genre, status).' },
        400
      );
    }

    updates.push('updated_at = ?');
    values.push(isoTimestamp(), existing.id, access.organizationId);

    await c.env.DB!.prepare(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`
    )
      .bind(...values)
      .run();

    const updated = await findProject(c.env, access.organizationId, existing.id);
    if (!updated) {
      return c.json({ error: 'write_failed', detail: 'Project could not be read back after update.' }, 500);
    }
    return c.json({ project: toPublicProject(updated) });
  });

  app.delete('/api/v1/projects/:id', async (c) => {
    const access = await authorize(c, true);
    if (!access.ok) return access.response;

    const existing = await findProject(c.env, access.organizationId, c.req.param('id'));
    if (!existing) return c.json({ error: 'not_found', detail: 'Project not found.' }, 404);

    await c.env.DB!.prepare(`DELETE FROM projects WHERE id = ? AND organization_id = ?`)
      .bind(existing.id, access.organizationId)
      .run();

    return c.json({ deleted: existing.id });
  });

  return app;
}

export default createProjectsApp();

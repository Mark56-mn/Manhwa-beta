/**
 * Asset routes (TASK 12) — R2-backed object storage behind env.FILES.
 *
 * Design (see tasks/TASK-12-R2-ASSETS.md):
 *  - Assets belong to an organization + project; the D1 `assets` row is
 *    authoritative for ownership and metadata. R2 holds the object only.
 *  - R2 keys are server-generated (never from the client); clients reference
 *    assets by D1 asset id.
 *  - Reads are scoped to organization membership; writes/deletes are gated by
 *    authenticated user.sub and the same-origin rule for mutations.
 *  - When auth or FILES is not configured, routes are honest (403/503), never
 *    invented.
 */

import { Hono } from 'hono';
import type { Env } from './env';
import { authConfigured } from './auth';
import { resolveFreebuffUser, type AuthenticatedUser, type UserResolver } from './identity';
import { firstOrganizationForUser } from './tenancy';
import { isAllowedMutationOrigin } from './origins';

const ASSET_CONTENT_TYPE_ALLOWLIST = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB application-level cap

function buildR2Key(orgId: string, projectId: string, assetId: string, filename: string): string {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() : '';
  const extClean = ext.replace(/[^a-z0-9]/g, '');
  return `org/${orgId}/proj/${projectId}/asset/${assetId}/${assetId}${extClean ? '.' + extClean : ''}`;
}

type AssetRow = {
  id: string;
  organization_id: string;
  project_id: string;
  r2_key: string;
  filename: string;
  content_type: string;
  size: number;
  etag: string | null;
  created_by_sub: string | null;
  created_at: string;
};

async function assetById(env: Env, assetId: string): Promise<AssetRow | null> {
  const row = await env.DB!.prepare(
    `SELECT id, organization_id, project_id, r2_key, filename, content_type, size, etag, created_by_sub, created_at
     FROM assets WHERE id = ?`
  )
    .bind(assetId)
    .first<AssetRow | null>();
  return row ?? null;
}

async function assetsByOrganization(env: Env, organizationId: string): Promise<AssetRow[]> {
  const rows = await env.DB!.prepare(
    `SELECT id, organization_id, project_id, r2_key, filename, content_type, size, etag, created_by_sub, created_at
     FROM assets WHERE organization_id = ? ORDER BY created_at DESC`
  )
    .bind(organizationId)
    .all<AssetRow>() as unknown as AssetRow[];
  return rows ?? [];
}

async function createAssetRecord(
  env: Env,
  organizationId: string,
  projectId: string,
  r2Key: string,
  filename: string,
  contentType: string,
  size: number,
  etag: string | null,
  createdBySub: string
): Promise<string> {
  const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await env.DB!.prepare(
    `INSERT INTO assets (id, organization_id, project_id, r2_key, filename, content_type, size, etag, created_by_sub)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, organizationId, projectId, r2Key, filename, contentType, size, etag, createdBySub)
    .run();
  return id;
}

function isAllowedContentType(type: string): boolean {
  const t = type.trim().split(';')[0].trim().toLowerCase();
  return ASSET_CONTENT_TYPE_ALLOWLIST.has(t);
}

export function createAssetApp(
  deps: { resolveUser: UserResolver } = { resolveUser: resolveFreebuffUser }
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  /**
   * Production default: verify the session via the shared identity module.
   * Tests inject a resolver, so no environment flag can ever mint a user.
   */
  const getUser = (c: { env: Env; req: { raw: Request } }): Promise<AuthenticatedUser | null> =>
    deps.resolveUser(c.req.raw, c.env);

/** List assets for the caller's organization (read-scoped, auth required). */
app.get('/api/v1/assets', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  if (!authConfigured(c.env)) {
    return c.json({ error: 'auth_not_configured', detail: 'No Freebuff OIDC client configured yet.' }, 503);
  }
  if (!c.env.FILES) {
    return c.json({ error: 'not_configured', detail: 'R2 binding not attached (TASK 12).' }, 503);
  }
  if (!c.env.DB) {
    return c.json({ error: 'not_configured', detail: 'D1 binding not attached (TASK 07).' }, 503);
  }

  const user = await getUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const orgId = await firstOrganizationForUser(c.env, user.sub);
  if (!orgId) return c.json({ error: 'forbidden', detail: 'Not a member of any organization.' }, 403);

  const assets = (await assetsByOrganization(c.env, orgId)).map((a) => ({ ...a, etag: a.etag ?? null }));
  return c.json({ assets });
});

/** Read asset by id: metadata + body streamed from R2. Org-member-scoped. */
app.get('/api/v1/assets/:id', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  if (!authConfigured(c.env)) {
    return c.json({ error: 'auth_not_configured', detail: 'No Freebuff OIDC client configured yet.' }, 503);
  }
  if (!c.env.FILES) {
    return c.json({ error: 'not_configured', detail: 'R2 binding not attached (TASK 12).' }, 503);
  }
  if (!c.env.DB) {
    return c.json({ error: 'not_configured', detail: 'D1 binding not attached (TASK 07).' }, 503);
  }

  const user = await getUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const orgId = await firstOrganizationForUser(c.env, user.sub);
  if (!orgId) return c.json({ error: 'forbidden', detail: 'Not a member of any organization.' }, 403);

  const asset = await assetById(c.env, c.req.param('id'));
  if (!asset) return c.json({ error: 'not_found', detail: `Asset ${c.req.param('id')} not found.` }, 404);
  if (asset.organization_id !== orgId) return c.json({ error: 'forbidden', detail: 'Not a member of this asset\u2019s organization.' }, 403);

  const r2 = await c.env.FILES.get(asset.r2_key) as
    | { body: ReadableStream | null; size: number; contentType?: string; etag?: string; httpEtag?: string }
    | null;
  if (!r2) return c.json({ error: 'not_found', detail: 'Asset object missing for ${asset.id}.' }, 404);

  const headers = new Headers();
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('Content-Type', asset.content_type);
  if (r2.etag != null) headers.set('ETag', r2.etag);
  else if (r2.httpEtag != null) headers.set('ETag', r2.httpEtag);
  headers.set('Content-Length', String(r2.size));
  headers.set('X-Asset-Id', asset.id);
  return new Response(r2.body ?? null, { headers });
});

/** Asset metadata headers only (no body). Org-member-scoped. */
app.on('HEAD', '/api/v1/assets/:id', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  if (!authConfigured(c.env)) {
    return c.json({ error: 'auth_not_configured', detail: 'No Freebuff OIDC client configured yet.' }, 503);
  }
  if (!c.env.FILES) {
    return c.json({ error: 'not_configured', detail: 'R2 binding not attached (TASK 12).' }, 503);
  }
  if (!c.env.DB) {
    return c.json({ error: 'not_configured', detail: 'D1 binding not attached (TASK 07).' }, 503);
  }

  const user = await getUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const orgId = await firstOrganizationForUser(c.env, user.sub);
  if (!orgId) return c.json({ error: 'forbidden', detail: 'Not a member of any organization.' }, 403);

  const asset = await assetById(c.env, c.req.param('id'));
  if (!asset) return c.json({ error: 'not_found', detail: `Asset ${c.req.param('id')} not found.` }, 404);
  if (asset.organization_id !== orgId) return c.json({ error: 'forbidden', detail: 'Not a member of this asset\u2019s organization.' }, 403);

  const r2 = await c.env.FILES.head(asset.r2_key) as
    | { size: number; etag?: string; httpEtag?: string; contentType?: string }
    | null;
  const headers = new Headers();
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('Content-Type', asset.content_type);
  headers.set('Content-Length', String((r2 as { size: number })?.size ?? asset.size));
  if ((r2 as { etag?: string }).etag != null) headers.set('ETag', (r2 as { etag?: string }).etag!);
  else if ((r2 as { httpEtag?: string }).httpEtag != null) headers.set('ETag', (r2 as { httpEtag?: string }).httpEtag!);
  headers.set('X-Asset-Id', asset.id);
  return new Response(null, { headers });
});

/** Create an asset: authenticated, org-scoped, content-type allow-listed, size-capped. */
app.put('/api/v1/assets', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  if (!authConfigured(c.env)) {
    return c.json({ error: 'auth_not_configured', detail: 'No Freebuff OIDC client configured yet.' }, 503);
  }
  if (!c.env.FILES) {
    return c.json({ error: 'not_configured', detail: 'R2 binding not attached (TASK 12).' }, 503);
  }
  if (!c.env.DB) {
    return c.json({ error: 'not_configured', detail: 'D1 binding not attached (TASK 07).' }, 503);
  }
  if (!c.env.APP_ORIGIN) {
    return c.json({ error: 'not_configured', detail: 'APP_ORIGIN not configured; mutating routes blocked.' }, 503);
  }

  // Same-origin / CSRF guard: the Origin must be on the exact allow-list.
  if (!isAllowedMutationOrigin(c.req.raw, c.env)) {
    return c.json({ error: 'forbidden', detail: 'Mutations only allowed from an allow-listed app origin.' }, 403);
  }

  const user = await getUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const orgId = await firstOrganizationForUser(c.env, user.sub);
  if (!orgId) return c.json({ error: 'forbidden', detail: 'Not a member of any organization.' }, 403);

  // Project must be supplied and belong to the caller's org.
  const projectId = c.req.header('X-Project-Id') ?? c.req.query('project_id');
  if (!projectId) return c.json({ error: 'bad_request', detail: 'X-Project-Id header or project_id query is required.' }, 400);
  const proj = await c.env.DB!.prepare(
    `SELECT id FROM projects WHERE id = ? AND organization_id = ?`
  )
    .bind(projectId, orgId)
    .first<{ id: string } | null>();
  if (!proj) return c.json({ error: 'bad_request', detail: 'Project not found in your organization.' }, 400);

  const contentType = c.req.header('Content-Type') ?? 'application/octet-stream';
  if (!isAllowedContentType(contentType)) {
    return c.json({ error: 'bad_request', detail: 'Content-Type not allowed for assets.' }, 400);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'payload_too_large', detail: `Upload too large (max ${MAX_UPLOAD_BYTES} bytes).` }, 413);
  }
  if (body.byteLength === 0) {
    return c.json({ error: 'bad_request', detail: 'Empty upload.' }, 400);
  }

  const filename = c.req.header('X-Filename') ?? 'asset.bin';
  const assetId = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const r2Key = buildR2Key(orgId, projectId, assetId, filename);

  const r2Result = await c.env.FILES.put(r2Key, body, {
    httpMetadata: { contentType: contentType.split(';')[0].trim() },
  }) as { key: string; size: number; etag?: string; httpEtag?: string } | null;
  if (!r2Result || !r2Result.key) {
    return c.json({ error: 'write_failed', detail: 'Failed to write asset to R2.' }, 500);
  }

  const id = await createAssetRecord(
    c.env,
    orgId,
    projectId,
    r2Key,
    filename,
    contentType.split(';')[0].trim(),
    body.byteLength,
    r2Result.httpEtag ?? r2Result.etag ?? null,
    user.sub
  );

  c.header('Cache-Control', 'private, no-store');
  return c.json(
    {
      id,
      r2_key: r2Key,
      filename,
      content_type: contentType.split(';')[0].trim(),
      size: body.byteLength,
      etag: r2Result.httpEtag ?? r2Result.etag ?? null,
    },
    201
  );
});

/** Delete an asset by id: remove D1 record + R2 object. Protected, org-scoped. */
app.delete('/api/v1/assets/:id', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  if (!authConfigured(c.env)) {
    return c.json({ error: 'auth_not_configured', detail: 'No Freebuff OIDC client configured yet.' }, 503);
  }
  if (!c.env.FILES) {
    return c.json({ error: 'not_configured', detail: 'R2 binding not attached (TASK 12).' }, 503);
  }
  if (!c.env.DB) {
    return c.json({ error: 'not_configured', detail: 'D1 binding not attached (TASK 07).' }, 503);
  }
  if (!c.env.APP_ORIGIN) {
    return c.json({ error: 'not_configured', detail: 'APP_ORIGIN not configured; mutating routes blocked.' }, 503);
  }

  if (!isAllowedMutationOrigin(c.req.raw, c.env)) {
    return c.json({ error: 'forbidden', detail: 'Mutations only allowed from an allow-listed app origin.' }, 403);
  }

  const user = await getUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const orgId = await firstOrganizationForUser(c.env, user.sub);
  if (!orgId) return c.json({ error: 'forbidden', detail: 'Not a member of any organization.' }, 403);

  const asset = await assetById(c.env, c.req.param('id'));
  if (!asset) return c.json({ error: 'not_found', detail: `Asset ${c.req.param('id')} not found.` }, 404);
  if (asset.organization_id !== orgId) return c.json({ error: 'forbidden', detail: 'Not a member of this asset\u2019s organization.' }, 403);

  await c.env.FILES.delete(asset.r2_key as string);
  await c.env.DB!.prepare(`DELETE FROM assets WHERE id = ?`).bind(asset.id).run();

  c.header('Cache-Control', 'private, no-store');
  return c.json({ deleted: asset.id });
});

  return app;
}

export default createAssetApp();

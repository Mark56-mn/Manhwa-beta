import { Hono } from 'hono';
import type { Env } from './env';
import { authConfigured, setupAuth } from './auth';

/**
 * Manhwa Studio API (blueprint TASK 06/07).
 *
 * Health endpoints report OBSERVED state only. Since TASK 07, D1 is a
 * required dependency: /readyz answers 503 until the database answers
 * a real SELECT 1. Auth is honest too: until the owner registers a
 * Freebuff OIDC client, protected routes answer `auth_not_configured`.
 */

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) =>
  c.json({
    service: 'manhwa-studio-api',
    status: 'ok',
    phase: 'TASK-07 D1 + tenancy foundation',
    routes: ['/healthz', '/readyz', '/api/v1/me', '/auth/freebuff/*']
  })
);

/** Liveness: proves the worker process is running. No dependencies touched. */
app.get('/healthz', (c) => c.json({ status: 'ok' }));

/**
 * Readiness: per-dependency observed status.
 * D1 is REQUIRED (non-2xx until it answers); R2 and auth report honest
 * `not_configured` until their tasks land.
 */
app.get('/readyz', async (c) => {
  const { env } = c;
  const checks: Record<string, { status: string; detail: string }> = {};

  if (!env.DB) {
    checks.d1 = { status: 'error', detail: 'No D1 binding attached.' };
  } else {
    try {
      const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
      checks.d1 =
        row?.ok === 1
          ? { status: 'ok', detail: 'D1 binding answered SELECT 1.' }
          : { status: 'error', detail: 'D1 binding returned an unexpected result.' };
    } catch {
      checks.d1 = { status: 'error', detail: 'D1 query failed.' };
    }
  }

  checks.r2 = env.FILES
    ? { status: 'ok', detail: 'R2 binding attached.' }
    : { status: 'not_configured', detail: 'No R2 binding yet (TASK 12; API token currently lacks R2 permission).' };

  checks.auth = authConfigured(env)
    ? { status: 'ok', detail: 'Sign in with Freebuff client configured.' }
    : { status: 'not_configured', detail: 'No Freebuff OIDC client configured (registered by the owner; see TASK-07 handoff).' };

  const d1Ok = checks.d1.status === 'ok';
  return c.json({ status: d1Ok ? 'ready' : 'degraded', checks }, d1Ok ? 200 : 503);
});

/**
 * Auth routes: answered honestly by this worker until the owner registers a
 * client. When configured, the SDK's wrap() intercepts /auth/freebuff/*
 * before the inner app, so this branch is only reached when not configured.
 */
app.all('/auth/freebuff/*', (c) =>
  c.json(
    {
      error: 'auth_not_configured',
      detail:
        'Sign in with Freebuff client IDs must be registered by the project owner (npx @freebuff/auth register, or Freebuff Desktop). See docs/handoffs/TASK-07-HANDOFF.md.'
    },
    503
  )
);

/**
 * Protected example route: the pattern every future user-data route must
 * follow — server-side getUser, 401 when signed out, personalized responses
 * never cached. Future state-changing routes must additionally pass
 * isSameOriginRequest(request, env.APP_ORIGIN) and authorize against rows
 * keyed by user.sub.
 */
app.get('/api/v1/me', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  if (!authConfigured(c.env)) {
    return c.json({ error: 'auth_not_configured', detail: 'No Freebuff OIDC client configured yet.' }, 503);
  }
  const user = await setupAuth(c.env).getUser(c.req.raw);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ sub: user.sub, name: user.name ?? null });
});

type FetchHandler = (request: Request, env: Env) => Response | Promise<Response>;

let wrapped: FetchHandler | undefined;
let plain: FetchHandler | undefined;

function resolve(env: Env): FetchHandler {
  if (authConfigured(env)) {
    // One wrap per isolate; the SDK handles /auth/freebuff/* and cookies.
    const handler: FetchHandler | undefined = wrapped;
    if (handler) return handler;
    const next: FetchHandler = setupAuth(env).wrap(async (request: Request, env2: Env) => app.fetch(request, env2));
    wrapped = next;
    return next;
  }
  const existing: FetchHandler | undefined = plain;
  if (existing) return existing;
  const next: FetchHandler = async (request: Request, env2: Env) => app.fetch(request, env2);
  plain = next;
  return next;
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    return resolve(env)(request, env);
  }
};

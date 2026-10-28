import { Hono } from 'hono';
import type { Env } from './env';
import { authConfigured } from './auth';
import { resolveSupabaseUser } from './identity';
import assetApp from './assets';
import projectsApp from './projects';
import storyApp from './story';
import { allowedOrigins, corsHeadersFor, preflightHeadersFor } from './origins';

/**
 * Manhwa Studio API (blueprint TASK 06/07, auth replaced in TASK 11).
 *
 * Health endpoints report OBSERVED state only. D1 is a required dependency:
 * /readyz answers 503 until the database answers a real SELECT 1. Auth is
 * honest too: until SUPABASE_URL is configured, protected routes answer
 * `auth_not_configured`.
 *
 * Identity is a Supabase Auth access token sent as `Authorization: Bearer`
 * (see worker/src/auth.ts). There is no server-side login route and no session
 * cookie: registration, sign-in, sign-out, session restoration and password
 * reset all happen in the browser through supabase-js.
 */

const app = new Hono<{ Bindings: Env }>();

/**
 * CORS for the second host (see worker/src/origins.ts).
 *
 * Only exact configured origins are echoed back, always with credentials and
 * `Vary: Origin`; a wildcard is never emitted. Preflights from unlisted
 * origins are rejected. Non-browser callers send no Origin and are unaffected
 * here (their mutations are still gated by the route-level origin guard).
 */
app.use('*', async (c, next) => {
  // Responses are origin-dependent, including refusals, so every response is
  // marked `Vary: Origin` to keep shared caches from mixing them up.
  c.header('Vary', 'Origin');

  const origin = c.req.header('Origin');
  if (origin) {
    if (c.req.method === 'OPTIONS') {
      const headers = preflightHeadersFor(origin, c.env);
      if (!headers) {
        return c.json({ error: 'forbidden', detail: 'Origin not allowed.' }, 403);
      }
      return new Response(null, { status: 204, headers });
    }
    const headers = corsHeadersFor(origin, c.env);
    if (headers) {
      for (const [name, value] of Object.entries(headers)) c.header(name, value);
    }
  }
  await next();
});

app.get('/', (c) =>
  c.json({
    service: 'manhwa-studio-api',
    status: 'ok',
    phase: 'TASK-11 Supabase Auth',
    routes: ['/healthz', '/readyz', '/api/v1/me', '/api/v1/projects', '/api/v1/assets/*']
  })
);

/** Liveness: proves the worker process is running. No dependencies touched. */
app.get('/healthz', (c) => c.json({ status: 'ok' }));

/**
 * Readiness: per-dependency observed status.
 * D1 is REQUIRED (non-2xx until it answers); R2 and auth report honest
 * `not_configured` until their configuration exists.
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
    : { status: 'not_configured', detail: 'No R2 binding attached (TASK 12).' };

  checks.auth = authConfigured(env)
    ? { status: 'ok', detail: 'Supabase project configured for access-token verification.' }
    : {
        status: 'not_configured',
        detail: 'SUPABASE_URL is unset or not a bare http(s) origin; protected routes answer 503.'
      };

  // Public, count-only view of the CORS allow-list. Origin values are not
  // disclosed; a misconfiguration is visible without guessing.
  const origins = allowedOrigins(env);
  checks.origins = origins.length > 0
    ? { status: 'ok', detail: `${origins.length} exact origin(s) allowed.` }
    : { status: 'not_configured', detail: 'No valid APP_ORIGIN/ALLOWED_ORIGINS; mutations will be rejected.' };

  const d1Ok = checks.d1.status === 'ok';
  return c.json({ status: d1Ok ? 'ready' : 'degraded', checks }, d1Ok ? 200 : 503);
});

/**
 * Project routes: the shared, tenant-scoped workflow the frontend calls.
 */
app.route('/', projectsApp);

/**
 * Story Bible, episode, generation and credit routes (TASK 04).
 */
app.route('/', storyApp);

/**
 * Asset routes (TASK 12): delegated to `worker/src/assets.ts`.
 */
app.all('/api/v1/assets/*', async (c) => {
  return assetApp.fetch(c.req.raw, c.env);
});

/**
 * The retired Freebuff OIDC routes.
 *
 * They are answered explicitly instead of 404 so an old bookmark, script or
 * client fails with an accurate reason: authentication moved to Supabase and
 * happens entirely in the browser. This is not an outage.
 */
app.all('/auth/freebuff/*', (c) => {
  c.header('Cache-Control', 'private, no-store');
  return c.json(
    {
      error: 'auth_moved',
      detail:
        'Sign in with Freebuff has been replaced by Supabase Auth. Register, sign in, sign out and reset passwords with supabase-js in the browser, then send the access token as `Authorization: Bearer`.'
    },
    410
  );
});

/**
 * The caller's verified identity. The pattern every future user-data route
 * follows: server-side verification, 401 when signed out, personalized
 * responses never cached. State-changing routes additionally pass
 * isAllowedMutationOrigin(request, env) and authorize against rows keyed by
 * user.sub.
 */
app.get('/api/v1/me', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  if (!authConfigured(c.env)) {
    return c.json(
      { error: 'auth_not_configured', detail: 'SUPABASE_URL is not configured; access tokens cannot be verified.' },
      503
    );
  }
  const user = await resolveSupabaseUser(c.req.raw, c.env);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ sub: user.sub, name: user.name ?? null });
});

export { app };

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    // No SDK wrapper: this app is the whole surface, and every protected route
    // verifies the bearer token itself.
    return app.fetch(request, env);
  }
};

import { Hono } from 'hono';
import type { Env } from './env';

/**
 * Manhwa Studio API — foundation worker (blueprint TASK 06).
 *
 * Health endpoints report OBSERVED state only. "not_configured" means the
 * binding does not exist yet; nothing here assumes a dependency is connected.
 * Error details are kept generic so a public endpoint never leaks internals.
 */

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) =>
  c.json({
    service: 'manhwa-studio-api',
    status: 'ok',
    phase: 'TASK-06 foundation',
    routes: ['/healthz', '/readyz'],
  })
);

/** Liveness: proves the worker process is running. No dependencies touched. */
app.get('/healthz', (c) => c.json({ status: 'ok' }));

/**
 * Readiness: reports the real state of each dependency.
 *
 * Until storage bindings exist (TASK 07+), the foundation routes are still
 * considered servable, so this endpoint answers 200 with an honest per-check
 * status instead of failing hard. When TASK 07 attaches D1, flip the response
 * to a non-2xx when a required dependency is not ok.
 */
app.get('/readyz', async (c) => {
  const { env } = c;
  const checks: Record<string, { status: string; detail: string }> = {};

  if (!env.DB) {
    checks.d1 = { status: 'not_configured', detail: 'No D1 binding attached yet (database created in TASK 07).' };
  } else {
    try {
      const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
      checks.d1 =
        row?.ok === 1
          ? { status: 'ok', detail: 'D1 binding answered SELECT 1.' }
          : { status: 'degraded', detail: 'D1 binding returned an unexpected result.' };
    } catch {
      checks.d1 = { status: 'error', detail: 'D1 query failed.' };
    }
  }

  checks.r2 = env.FILES
    ? { status: 'ok', detail: 'R2 binding attached.' }
    : { status: 'not_configured', detail: 'No R2 binding attached yet (TASK 12; API token currently lacks R2 permission).' };

  const allOk = Object.values(checks).every((check) => check.status === 'ok');
  return c.json({ status: allOk ? 'ready' : 'degraded', checks });
});

export default app;

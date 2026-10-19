import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';

type R2Bucket = { head(key: string): Promise<unknown> };

describe('R2 binding smoke (TASK 12)', () => {
  it('handles missing FILES binding gracefully', async () => {
    const app = new Hono<{ Bindings: { FILES?: R2Bucket } }>();
    app.get('/readyz-r2', async (c) => {
      const files = c.env.FILES;
      return c.json(files ? { ok: true } : { ok: false, status: 'not_configured' });
    });

    const req = new Request('http://localhost/readyz-r2');
    const res = await app.fetch(req, {});
    const json = await res.json() as { ok: boolean; status?: string };
    expect(json.ok).toBe(false);
    expect(json.status).toBe('not_configured');
  });
});
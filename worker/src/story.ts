import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from './env';
import { authConfigured } from './auth';
import { resolveFreebuffUser, type AuthenticatedUser, type UserResolver } from './identity';
import { resolveOrganizationForUser } from './provisioning';
import { isAllowedMutationOrigin } from './origins';
import { AiProviderError, providerFromEnv, type AiProvider } from './ai';
import {
  StoryContentError,
  buildEpisodePrompt,
  buildStoryBiblePrompt,
  normalizeEpisode,
  normalizeEpisodeBrief,
  normalizeStoryBible,
  normalizeStoryBrief,
  parseEpisodeOutput,
  parseStoryBibleOutput,
  type EpisodeContent,
  type StoryBibleContent
} from './storyContent';
import {
  CREDIT_COSTS,
  creditHistory,
  ensureCreditAccount,
  getBalance,
  releaseCredits,
  reserveCredits,
  settleCredits,
  type CreditCostKey,
  type CreditLedgerEntry
} from './credits';

/**
 * Persistent Story Bible, episodes, generation jobs and credits (TASK 04).
 *
 * Security / honesty model:
 *  - every route resolves the tenant from the verified session and scopes SQL
 *    by organization_id; cross-tenant ids answer 404;
 *  - costs, balances, plans and idempotency are server-owned;
 *  - no output is saved or charged until provider content validated;
 *  - failures record a safe job error and release the reservation;
 *  - no scheduler exists: a job runs synchronously in the request and is
 *    durable afterwards (`pending` → `running` → `succeeded`/`failed`).
 */

type Access =
  | { ok: true; user: AuthenticatedUser; organizationId: string }
  | { ok: false; response: Response };

interface ProjectRow {
  id: string;
  title: string;
  genre: string | null;
}

interface StoryBibleRow {
  id: string;
  organization_id: string;
  project_id: string;
  version: number;
  premise: string;
  synopsis: string;
  worldbuilding: string;
  world_rules: string;
  characters: string;
  locations: string;
  factions: string;
  timeline: string;
  continuity: string;
  themes: string;
  tone: string;
  structure: string;
  arcs: string;
  created_at: string;
  updated_at: string;
}

interface EpisodeRow {
  id: string;
  organization_id: string;
  project_id: string;
  episode_number: number;
  version: number;
  title: string;
  outline: string;
  script: string;
  status: 'draft' | 'generating' | 'ready_for_review' | 'failed' | 'approved';
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectProfileRow {
  project_id: string;
  description: string | null;
  language: string | null;
  target_audience: string | null;
  updated_at: string;
}

interface JobRow {
  id: string;
  organization_id: string;
  project_id: string;
  job_type: 'story_bible' | 'episode_script';
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  attempts: number;
  max_attempts: number;
  idempotency_key: string;
  error_code: string | null;
  provider: string | null;
  model: string | null;
  output_type: 'story_bible' | 'episode' | null;
  output_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const MEDIA_TYPES = ['image', 'voice', 'video'] as const;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_LEDGER_ROWS = 50;

function isoTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
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

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function toPublicBible(row: StoryBibleRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    version: row.version,
    premise: row.premise,
    synopsis: row.synopsis,
    worldbuilding: row.worldbuilding,
    world_rules: parseJsonArray<string>(row.world_rules),
    characters: parseJsonArray<StoryBibleContent['characters'][number]>(row.characters),
    locations: parseJsonArray<StoryBibleContent['locations'][number]>(row.locations),
    factions: parseJsonArray<StoryBibleContent['factions'][number]>(row.factions),
    timeline: parseJsonArray<string>(row.timeline),
    continuity: parseJsonArray<string>(row.continuity),
    themes: parseJsonArray<string>(row.themes),
    tone: row.tone,
    structure: row.structure,
    arcs: parseJsonArray<StoryBibleContent['arcs'][number]>(row.arcs),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function contentFromRow(row: StoryBibleRow): StoryBibleContent {
  return {
    premise: row.premise,
    synopsis: row.synopsis,
    worldbuilding: row.worldbuilding,
    worldRules: parseJsonArray<string>(row.world_rules),
    characters: parseJsonArray<StoryBibleContent['characters'][number]>(row.characters),
    locations: parseJsonArray<StoryBibleContent['locations'][number]>(row.locations),
    factions: parseJsonArray<StoryBibleContent['factions'][number]>(row.factions),
    timeline: parseJsonArray<string>(row.timeline),
    continuity: parseJsonArray<string>(row.continuity),
    themes: parseJsonArray<string>(row.themes),
    tone: row.tone,
    structure: row.structure,
    arcs: parseJsonArray<StoryBibleContent['arcs'][number]>(row.arcs)
  };
}

function toPublicEpisode(row: EpisodeRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    episode_number: row.episode_number,
    version: row.version,
    title: row.title,
    outline: parseJsonArray<string>(row.outline),
    script: row.script,
    status: row.status,
    job_id: row.job_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toPublicProfile(row: ProjectProfileRow) {
  return {
    project_id: row.project_id,
    description: row.description,
    language: row.language,
    target_audience: row.target_audience,
    updated_at: row.updated_at
  };
}

function optionalProfileText(
  value: unknown,
  field: string,
  maxLength: number
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new StoryContentError(`${field} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new StoryContentError(`${field} must be at most ${maxLength} characters.`);
  }
  return trimmed.length > 0 ? trimmed : null;
}

function toPublicJob(row: JobRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    type: row.job_type,
    status: row.status,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    error_code: row.error_code,
    provider: row.provider,
    model: row.model,
    output_type: row.output_type,
    output_id: row.output_id,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at
  };
}

const BIBLE_COLUMNS = `id, organization_id, project_id, version, premise, synopsis, worldbuilding,
  world_rules, characters, locations, factions, timeline, continuity, themes, tone, structure, arcs,
  created_at, updated_at`;

const EPISODE_COLUMNS = `id, organization_id, project_id, episode_number, version, title, outline, script,
  status, job_id, created_at, updated_at`;

const JOB_COLUMNS = `id, organization_id, project_id, job_type, status, attempts, max_attempts,
  idempotency_key, error_code, provider, model, output_type, output_id, created_at, started_at, completed_at`;

export interface StoryDeps {
  resolveUser: UserResolver;
  /** Production builds the Gemini adapter from env; tests inject a fake. */
  resolveProvider: (env: Env) => AiProvider | null;
  /** Current time, injectable for deterministic job/credit tests. */
  now?: () => Date;
}

export function createStoryApp(
  deps: StoryDeps = {
    resolveUser: resolveFreebuffUser,
    resolveProvider: providerFromEnv
  }
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  const now = deps.now ?? (() => new Date());

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    await next();
  });

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
          { error: 'forbidden', detail: 'Mutations only allowed from an allow-listed app origin.' },
          403
        )
      };
    }

    const user = await deps.resolveUser(c.req.raw, c.env);
    if (!user) return { ok: false, response: c.json({ error: 'unauthorized' }, 401) };

    // Tenant scope comes from the verified session; a first-time user gets one
    // workspace provisioned server-side (never from a client-supplied id).
    const organizationId = await resolveOrganizationForUser(c.env, user);
    if (!organizationId) {
      return {
        ok: false,
        response: c.json({ error: 'forbidden', detail: 'Not a member of any organization.' }, 403)
      };
    }
    return { ok: true, user, organizationId };
  }

  async function projectFor(
    env: Env,
    organizationId: string,
    projectId: string
  ): Promise<ProjectRow | null> {
    return env.DB!.prepare(
      `SELECT id, title, genre FROM projects WHERE id = ? AND organization_id = ?`
    )
      .bind(projectId, organizationId)
      .first<ProjectRow | null>();
  }

  async function profileFor(
    env: Env,
    organizationId: string,
    projectId: string
  ): Promise<ProjectProfileRow | null> {
    return env.DB!.prepare(
      `SELECT pp.project_id, pp.description, pp.language, pp.target_audience, pp.updated_at
       FROM project_profiles pp
       JOIN projects p ON p.id = pp.project_id
       WHERE pp.project_id = ? AND p.organization_id = ?`
    )
      .bind(projectId, organizationId)
      .first<ProjectProfileRow | null>();
  }

  async function latestBible(
    env: Env,
    organizationId: string,
    projectId: string
  ): Promise<StoryBibleRow | null> {
    return env.DB!.prepare(
      `SELECT ${BIBLE_COLUMNS} FROM story_bibles
       WHERE organization_id = ? AND project_id = ? ORDER BY version DESC LIMIT 1`
    )
      .bind(organizationId, projectId)
      .first<StoryBibleRow | null>();
  }

  async function bibleById(
    env: Env,
    organizationId: string,
    id: string
  ): Promise<StoryBibleRow | null> {
    return env.DB!.prepare(
      `SELECT ${BIBLE_COLUMNS} FROM story_bibles WHERE organization_id = ? AND id = ?`
    )
      .bind(organizationId, id)
      .first<StoryBibleRow | null>();
  }

  async function episodeById(
    env: Env,
    organizationId: string,
    id: string
  ): Promise<EpisodeRow | null> {
    return env.DB!.prepare(
      `SELECT ${EPISODE_COLUMNS} FROM episodes WHERE organization_id = ? AND id = ?`
    )
      .bind(organizationId, id)
      .first<EpisodeRow | null>();
  }

  async function jobFor(
    env: Env,
    organizationId: string,
    jobId: string
  ): Promise<JobRow | null> {
    return env.DB!.prepare(
      `SELECT ${JOB_COLUMNS} FROM generation_jobs WHERE organization_id = ? AND id = ?`
    )
      .bind(organizationId, jobId)
      .first<JobRow | null>();
  }

  async function jobByKey(
    env: Env,
    organizationId: string,
    idempotencyKey: string
  ): Promise<JobRow | null> {
    return env.DB!.prepare(
      `SELECT ${JOB_COLUMNS} FROM generation_jobs WHERE organization_id = ? AND idempotency_key = ?`
    )
      .bind(organizationId, idempotencyKey)
      .first<JobRow | null>();
  }

  async function outputFor(env: Env, job: JobRow) {
    if (!job.output_id) return null;
    if (job.output_type === 'story_bible') {
      const row = await bibleById(env, job.organization_id, job.output_id);
      return row ? { kind: 'story_bible' as const, story_bible: toPublicBible(row) } : null;
    }
    if (job.output_type === 'episode') {
      const row = await episodeById(env, job.organization_id, job.output_id);
      return row ? { kind: 'episode' as const, episode: toPublicEpisode(row) } : null;
    }
    return null;
  }

  async function creditsSummary(env: Env, organizationId: string) {
    const account = await ensureCreditAccount(env.DB!, organizationId, now());
    return {
      balance: account.balance,
      plan: account.plan,
      initial_granted_at: account.initialGrantedAt,
      costs: CREDIT_COSTS
    };
  }

  async function failJob(
    env: Env,
    job: JobRow,
    code: string,
    organizationId: string
  ): Promise<void> {
    await env.DB!.prepare(
      `UPDATE generation_jobs SET status = 'failed', error_code = ?, completed_at = ? WHERE id = ?`
    )
      .bind(code, isoTimestamp(now()), job.id)
      .run();
    await releaseCredits(env.DB!, organizationId, job.id, now());
  }

  /** GET .../profile — project description, language and target audience. */
  app.get('/api/v1/projects/:id/profile', async (c) => {
    const access = await authorize(c, false);
    if (!access.ok) return access.response;

    const project = await projectFor(c.env, access.organizationId, c.req.param('id'));
    if (!project) return c.json({ error: 'not_found', detail: 'Project not found.' }, 404);

    const profile = await profileFor(c.env, access.organizationId, project.id);
    return c.json({ profile: profile ? toPublicProfile(profile) : null });
  });

  /** PUT .../profile — create or update the project profile (no credit cost). */
  app.put('/api/v1/projects/:id/profile', async (c) => {
    const access = await authorize(c, true);
    if (!access.ok) return access.response;

    const project = await projectFor(c.env, access.organizationId, c.req.param('id'));
    if (!project) return c.json({ error: 'not_found', detail: 'Project not found.' }, 404);

    const body = await readJsonObject(c.req.raw);
    if (!body) return c.json({ error: 'bad_request', detail: 'Expected a JSON object body.' }, 400);

    let description: string | null;
    let language: string | null;
    let targetAudience: string | null;
    try {
      description = optionalProfileText(body.description, 'description', 2000);
      language = optionalProfileText(body.language, 'language', 40);
      targetAudience = optionalProfileText(body.targetAudience, 'targetAudience', 200);
    } catch (error) {
      return c.json(
        { error: 'bad_request', detail: error instanceof Error ? error.message : 'Invalid profile.' },
        400
      );
    }

    const at = isoTimestamp(now());
    await c.env.DB!.prepare(
      `INSERT INTO project_profiles (project_id, description, language, target_audience, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         description = excluded.description,
         language = excluded.language,
         target_audience = excluded.target_audience,
         updated_at = excluded.updated_at`
    )
      .bind(project.id, description, language, targetAudience, at)
      .run();

    const saved = await profileFor(c.env, access.organizationId, project.id);
    return c.json({ profile: saved ? toPublicProfile(saved) : null });
  });

  /** GET /api/v1/credits — tenant balance, costs and recent ledger. */
  app.get('/api/v1/credits', async (c) => {
    const access = await authorize(c, false);
    if (!access.ok) return access.response;

    const credits = await creditsSummary(c.env, access.organizationId);
    const history: CreditLedgerEntry[] = await creditHistory(
      c.env.DB!,
      access.organizationId,
      MAX_LEDGER_ROWS
    );
    return c.json({ credits, history });
  });

  /** GET /api/v1/projects/:id/story-bible — latest version. */
  app.get('/api/v1/projects/:id/story-bible', async (c) => {
    const access = await authorize(c, false);
    if (!access.ok) return access.response;

    const project = await projectFor(c.env, access.organizationId, c.req.param('id'));
    if (!project) return c.json({ error: 'not_found', detail: 'Project not found.' }, 404);

    const row = await latestBible(c.env, access.organizationId, project.id);
    if (!row) {
      return c.json({ error: 'not_found', detail: 'No Story Bible exists for this project yet.' }, 404);
    }
    return c.json({ story_bible: toPublicBible(row) });
  });

  /** PUT .../story-bible — manual edit/creation as a NEW version. */
  app.put('/api/v1/projects/:id/story-bible', async (c) => {
    const access = await authorize(c, true);
    if (!access.ok) return access.response;

    const project = await projectFor(c.env, access.organizationId, c.req.param('id'));
    if (!project) return c.json({ error: 'not_found', detail: 'Project not found.' }, 404);

    const body = await readJsonObject(c.req.raw);
    if (!body) return c.json({ error: 'bad_request', detail: 'Expected a JSON object body.' }, 400);

    let content: StoryBibleContent;
    try {
      content = normalizeStoryBible(body);
    } catch (error) {
      return c.json(
        { error: 'bad_request', detail: error instanceof Error ? error.message : 'Invalid Story Bible.' },
        400
      );
    }

    const at = isoTimestamp(now());
    const row = await c.env.DB!.prepare(
      `SELECT COALESCE(MAX(version), 0) AS version FROM story_bibles
       WHERE organization_id = ? AND project_id = ?`
    )
      .bind(access.organizationId, project.id)
      .first<{ version: number } | null>();
    const version = (row?.version ?? 0) + 1;
    const id = `bible-${crypto.randomUUID()}`;

    await c.env.DB!.prepare(
      `INSERT INTO story_bibles
         (id, organization_id, project_id, version, premise, synopsis, worldbuilding, world_rules,
          characters, locations, factions, timeline, continuity, themes, tone, structure, arcs,
          created_by_sub, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        access.organizationId,
        project.id,
        version,
        content.premise,
        content.synopsis,
        content.worldbuilding,
        JSON.stringify(content.worldRules),
        JSON.stringify(content.characters),
        JSON.stringify(content.locations),
        JSON.stringify(content.factions),
        JSON.stringify(content.timeline),
        JSON.stringify(content.continuity),
        JSON.stringify(content.themes),
        content.tone,
        content.structure,
        JSON.stringify(content.arcs),
        access.user.sub,
        at,
        at
      )
      .run();

    const saved = await bibleById(c.env, access.organizationId, id);
    if (!saved) {
      return c.json({ error: 'write_failed', detail: 'Story Bible could not be read back.' }, 500);
    }
    return c.json({ story_bible: toPublicBible(saved) }, 201);
  });

  /** GET .../episodes — latest version per episode number. */
  app.get('/api/v1/projects/:id/episodes', async (c) => {
    const access = await authorize(c, false);
    if (!access.ok) return access.response;

    const project = await projectFor(c.env, access.organizationId, c.req.param('id'));
    if (!project) return c.json({ error: 'not_found', detail: 'Project not found.' }, 404);

    const rows = await c.env.DB!.prepare(
      `SELECT ${EPISODE_COLUMNS} FROM episodes
       WHERE organization_id = ? AND project_id = ?
       ORDER BY episode_number, version DESC`
    )
      .bind(access.organizationId, project.id)
      .all<EpisodeRow>();

    const latest = new Map<number, EpisodeRow>();
    for (const row of (rows ?? []) as EpisodeRow[]) {
      if (!latest.has(row.episode_number)) latest.set(row.episode_number, row);
    }
    return c.json({
      episodes: [...latest.values()]
        .sort((a, b) => a.episode_number - b.episode_number)
        .map(toPublicEpisode)
    });
  });

  /** GET .../episodes/:number — latest version of one episode. */
  app.get('/api/v1/projects/:id/episodes/:episodeNumber', async (c) => {
    const access = await authorize(c, false);
    if (!access.ok) return access.response;

    const project = await projectFor(c.env, access.organizationId, c.req.param('id'));
    if (!project) return c.json({ error: 'not_found', detail: 'Project not found.' }, 404);

    const number = Number(c.req.param('episodeNumber'));
    if (!Number.isInteger(number) || number < 1) {
      return c.json({ error: 'bad_request', detail: 'Invalid episode number.' }, 400);
    }
    const row = await c.env.DB!.prepare(
      `SELECT ${EPISODE_COLUMNS} FROM episodes
       WHERE organization_id = ? AND project_id = ? AND episode_number = ?
       ORDER BY version DESC LIMIT 1`
    )
      .bind(access.organizationId, project.id, number)
      .first<EpisodeRow | null>();
    if (!row) return c.json({ error: 'not_found', detail: 'Episode not found.' }, 404);
    return c.json({ episode: toPublicEpisode(row) });
  });

  /** PATCH .../episodes/:number — approve a ready-for-review episode. */
  app.patch('/api/v1/projects/:id/episodes/:episodeNumber', async (c) => {
    const access = await authorize(c, true);
    if (!access.ok) return access.response;

    const project = await projectFor(c.env, access.organizationId, c.req.param('id'));
    if (!project) return c.json({ error: 'not_found', detail: 'Project not found.' }, 404);

    const number = Number(c.req.param('episodeNumber'));
    if (!Number.isInteger(number) || number < 1) {
      return c.json({ error: 'bad_request', detail: 'Invalid episode number.' }, 400);
    }

    const body = await readJsonObject(c.req.raw);
    if (!body || body.status !== 'approved') {
      return c.json(
        { error: 'bad_request', detail: "The only supported transition is status: 'approved'." },
        400
      );
    }

    const current = await c.env.DB!.prepare(
      `SELECT ${EPISODE_COLUMNS} FROM episodes
       WHERE organization_id = ? AND project_id = ? AND episode_number = ?
       ORDER BY version DESC LIMIT 1`
    )
      .bind(access.organizationId, project.id, number)
      .first<EpisodeRow | null>();
    if (!current) return c.json({ error: 'not_found', detail: 'Episode not found.' }, 404);
    if (current.status !== 'ready_for_review') {
      return c.json(
        { error: 'conflict', detail: 'Only a ready-for-review episode can be approved.' },
        409
      );
    }

    await c.env.DB!.prepare(
      `UPDATE episodes SET status = 'approved', updated_at = ? WHERE id = ? AND organization_id = ?`
    )
      .bind(isoTimestamp(now()), current.id, access.organizationId)
      .run();

    const updated = await episodeById(c.env, access.organizationId, current.id);
    return c.json({ episode: updated ? toPublicEpisode(updated) : null });
  });

  /** GET /api/v1/jobs/:id — durable job status. */
  app.get('/api/v1/jobs/:id', async (c) => {
    const access = await authorize(c, false);
    if (!access.ok) return access.response;

    const job = await jobFor(c.env, access.organizationId, c.req.param('id'));
    if (!job) return c.json({ error: 'not_found', detail: 'Job not found.' }, 404);
    return c.json({ job: toPublicJob(job), output: await outputFor(c.env, job) });
  });

  /**
   * POST .../generations — run one bounded generation synchronously.
   *
   * Idempotency key is required. A repeat returns the existing job/output with
   * no new charge. Provider work starts only after a successful reservation.
   */
  app.post('/api/v1/projects/:id/generations', async (c) => {
    const access = await authorize(c, true);
    if (!access.ok) return access.response;

    const project = await projectFor(c.env, access.organizationId, c.req.param('id'));
    if (!project) return c.json({ error: 'not_found', detail: 'Project not found.' }, 404);

    const body = await readJsonObject(c.req.raw);
    if (!body) return c.json({ error: 'bad_request', detail: 'Expected a JSON object body.' }, 400);

    const requestedType = body.type;
    if ((MEDIA_TYPES as readonly string[]).includes(String(requestedType))) {
      return c.json(
        {
          error: 'plan_restricted',
          detail: 'The free writing plan does not include image, voice or video generation.'
        },
        403
      );
    }
    if (requestedType !== 'story_bible' && requestedType !== 'episode_script') {
      return c.json(
        { error: 'bad_request', detail: "type must be 'story_bible' or 'episode_script'." },
        400
      );
    }

    const key = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    if (!IDEMPOTENCY_PATTERN.test(key)) {
      return c.json(
        { error: 'bad_request', detail: 'idempotencyKey must be 8-128 URL-safe characters.' },
        400
      );
    }

    let brief: ReturnType<typeof normalizeStoryBrief> | ReturnType<typeof normalizeEpisodeBrief>;
    let bibleForPrompt: StoryBibleContent | null = null;
    try {
      if (requestedType === 'story_bible') {
        brief = normalizeStoryBrief(body);
      } else {
        brief = normalizeEpisodeBrief(body);
        const bible = await latestBible(c.env, access.organizationId, project.id);
        bibleForPrompt = bible ? contentFromRow(bible) : null;
      }
    } catch (error) {
      return c.json(
        { error: 'bad_request', detail: error instanceof Error ? error.message : 'Invalid request.' },
        400
      );
    }

    // Idempotent replay wins over provider availability: a succeeded job still
    // returns its output even if the provider key was removed afterwards.
    const existing = await jobByKey(c.env, access.organizationId, key);
    if (existing) {
      return c.json(
        {
          job: toPublicJob(existing),
          output: await outputFor(c.env, existing),
          duplicate: true,
          credits: await creditsSummary(c.env, access.organizationId)
        },
        200
      );
    }

    const provider = deps.resolveProvider(c.env);
    if (!provider) {
      return c.json(
        {
          error: 'provider_not_configured',
          detail:
            'No AI provider is configured on this deployment. Nothing was generated or charged.'
        },
        503
      );
    }

    const cost: number = CREDIT_COSTS[requestedType as CreditCostKey];
    await ensureCreditAccount(c.env.DB!, access.organizationId, now());

    const at = isoTimestamp(now());
    const jobId = `job-${crypto.randomUUID()}`;
    const inserted = await c.env.DB!.prepare(
      `INSERT OR IGNORE INTO generation_jobs
         (id, organization_id, project_id, job_type, status, attempts, max_attempts,
          idempotency_key, created_by_sub, created_at)
       VALUES (?, ?, ?, ?, 'pending', 0, 1, ?, ?, ?)`
    )
      .bind(jobId, access.organizationId, project.id, requestedType, key, access.user.sub, at)
      .run();

    const changes = (inserted as { meta?: { changes?: number } })?.meta?.changes ?? 0;
    if (changes === 0) {
      const raced = await jobByKey(c.env, access.organizationId, key);
      if (!raced) {
        return c.json({ error: 'conflict', detail: 'Could not create the job.' }, 409);
      }
      return c.json(
        {
          job: toPublicJob(raced),
          output: await outputFor(c.env, raced),
          duplicate: true,
          credits: await creditsSummary(c.env, access.organizationId)
        },
        200
      );
    }

    const job = (await jobFor(c.env, access.organizationId, jobId))!;
    const reservation = await reserveCredits(
      c.env.DB!,
      access.organizationId,
      jobId,
      cost,
      now()
    );
    if (!reservation.ok) {
      await failJob(c.env, job, 'insufficient_credits', access.organizationId);
      const failed = (await jobFor(c.env, access.organizationId, jobId))!;
      return c.json(
        {
          error: 'insufficient_credits',
          detail: `This generation costs ${cost} writing credits; your balance is ${reservation.balance}. Nothing was generated.`,
          job: toPublicJob(failed),
          credits: await creditsSummary(c.env, access.organizationId)
        },
        402
      );
    }

    await c.env.DB!.prepare(
      `UPDATE generation_jobs
       SET status = 'running', attempts = attempts + 1, started_at = ?, provider = ?, model = ?
       WHERE id = ? AND organization_id = ?`
    )
      .bind(isoTimestamp(now()), provider.name, provider.model, jobId, access.organizationId)
      .run();

    try {
      const prompt =
        requestedType === 'story_bible'
          ? buildStoryBiblePrompt(brief as ReturnType<typeof normalizeStoryBrief>, project)
          : buildEpisodePrompt(
              brief as ReturnType<typeof normalizeEpisodeBrief>,
              project,
              bibleForPrompt
            );

      const raw = await provider.generate(prompt);
      const outputType = requestedType === 'story_bible' ? 'story_bible' : 'episode';
      let outputId: string;

      if (requestedType === 'story_bible') {
        const content = parseStoryBibleOutput(raw);
        const versionRow = await c.env.DB!.prepare(
          `SELECT COALESCE(MAX(version), 0) AS version FROM story_bibles
           WHERE organization_id = ? AND project_id = ?`
        )
          .bind(access.organizationId, project.id)
          .first<{ version: number } | null>();
        const version = (versionRow?.version ?? 0) + 1;
        outputId = `bible-${crypto.randomUUID()}`;
        const savedAt = isoTimestamp(now());
        await c.env.DB!.prepare(
          `INSERT INTO story_bibles
             (id, organization_id, project_id, version, premise, synopsis, worldbuilding, world_rules,
              characters, locations, factions, timeline, continuity, themes, tone, structure, arcs,
              created_by_sub, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            outputId,
            access.organizationId,
            project.id,
            version,
            content.premise,
            content.synopsis,
            content.worldbuilding,
            JSON.stringify(content.worldRules),
            JSON.stringify(content.characters),
            JSON.stringify(content.locations),
            JSON.stringify(content.factions),
            JSON.stringify(content.timeline),
            JSON.stringify(content.continuity),
            JSON.stringify(content.themes),
            content.tone,
            content.structure,
            JSON.stringify(content.arcs),
            access.user.sub,
            savedAt,
            savedAt
          )
          .run();
      } else {
        const content: EpisodeContent = parseEpisodeOutput(raw);
        const episodeNumber = (brief as ReturnType<typeof normalizeEpisodeBrief>).episodeNumber;
        const versionRow = await c.env.DB!.prepare(
          `SELECT COALESCE(MAX(version), 0) AS version FROM episodes
           WHERE organization_id = ? AND project_id = ? AND episode_number = ?`
        )
          .bind(access.organizationId, project.id, episodeNumber)
          .first<{ version: number } | null>();
        const version = (versionRow?.version ?? 0) + 1;
        outputId = `episode-${crypto.randomUUID()}`;
        const savedAt = isoTimestamp(now());
        await c.env.DB!.prepare(
          `INSERT INTO episodes
             (id, organization_id, project_id, episode_number, version, title, outline, script,
              status, job_id, created_by_sub, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready_for_review', ?, ?, ?, ?)`
        )
          .bind(
            outputId,
            access.organizationId,
            project.id,
            episodeNumber,
            version,
            content.title,
            JSON.stringify(content.outline),
            content.script,
            jobId,
            access.user.sub,
            savedAt,
            savedAt
          )
          .run();
      }

      await c.env.DB!.prepare(
        `UPDATE generation_jobs
         SET status = 'succeeded', output_type = ?, output_id = ?, completed_at = ?, error_code = NULL
         WHERE id = ? AND organization_id = ?`
      )
        .bind(outputType, outputId, isoTimestamp(now()), jobId, access.organizationId)
        .run();
      await settleCredits(c.env.DB!, access.organizationId, jobId, now());

      const succeeded = (await jobFor(c.env, access.organizationId, jobId))!;
      return c.json(
        {
          job: toPublicJob(succeeded),
          output: await outputFor(c.env, succeeded),
          credits: await creditsSummary(c.env, access.organizationId)
        },
        201
      );
    } catch (error) {
      const code =
        error instanceof AiProviderError
          ? error.code
          : error instanceof StoryContentError
            ? 'provider_bad_response'
            : 'server_error';
      const detail =
        error instanceof AiProviderError || error instanceof StoryContentError
          ? error.message
          : 'Generation failed before any content was saved.';
      await failJob(c.env, job, code, access.organizationId);
      const failed = (await jobFor(c.env, access.organizationId, jobId))!;

      const status =
        code === 'provider_rate_limited'
          ? 429
          : code === 'provider_timeout'
            ? 504
            : code === 'provider_auth_failed' ||
                code === 'provider_bad_response' ||
                code === 'provider_unavailable'
              ? 502
              : 500;

      return c.json(
        {
          error: code,
          detail,
          job: toPublicJob(failed),
          credits: await creditsSummary(c.env, access.organizationId)
        },
        status
      );
    }
  });

  return app;
}

export default createStoryApp();

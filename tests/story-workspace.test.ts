import { describe, expect, it } from 'bun:test';
import { ApiError, type CloudEpisode, type CloudStoryBible, type GenerationResponse } from '../src/lib/api';
import {
  approveEpisode,
  bibleToInput,
  failureMessage,
  generateContent,
  jobLabel,
  linesToArray,
  loadStoryBoard,
  newIdempotencyKey,
  saveBibleEdit,
  saveProfile,
  type StoryBoard
} from '../src/lib/storyWorkspace';

/**
 * Story Studio frontend logic (TASK 04). These are pure functions: no browser,
 * no network. They prove the UI states are derived honestly from API results.
 */

const CREDITS = {
  balance: 100,
  plan: 'free',
  initial_granted_at: '2026-10-23T12:00:00Z',
  costs: { story_bible: 10, episode_script: 15 }
};

const BIBLE: CloudStoryBible = {
  id: 'bible-1',
  project_id: 'p-1',
  version: 2,
  premise: 'A memory broker.',
  synopsis: 'She sold her past.',
  worldbuilding: 'Neon.',
  world_rules: ['Rule'],
  characters: [],
  locations: [],
  factions: [],
  timeline: [],
  continuity: [],
  themes: [],
  tone: 'Noir',
  structure: 'Three acts',
  arcs: [],
  created_at: '2026-10-23T12:00:00Z',
  updated_at: '2026-10-23T12:00:00Z'
};

const EPISODE: CloudEpisode = {
  id: 'episode-1',
  project_id: 'p-1',
  episode_number: 1,
  version: 1,
  title: 'Pilot',
  outline: ['Beat'],
  script: 'PANEL 1',
  status: 'ready_for_review',
  job_id: 'job-1',
  created_at: '2026-10-23T12:00:00Z',
  updated_at: '2026-10-23T12:00:00Z'
};

const JOB = {
  id: 'job-1',
  project_id: 'p-1',
  type: 'story_bible' as const,
  status: 'succeeded' as const,
  attempts: 1,
  max_attempts: 1,
  error_code: null,
  provider: 'gemini',
  model: 'test',
  output_type: 'story_bible' as const,
  output_id: 'bible-1',
  created_at: '2026-10-23T12:00:00Z',
  started_at: '2026-10-23T12:00:00Z',
  completed_at: '2026-10-23T12:00:00Z'
};

const SUCCESS: GenerationResponse = {
  job: JOB,
  output: { kind: 'story_bible', story_bible: BIBLE },
  credits: { ...CREDITS, balance: 90 }
};

describe('loadStoryBoard', () => {
  it('returns server records only', async () => {
    const board = await loadStoryBoard(
      {
        getProjectProfile: async () => null,
        getStoryBible: async () => BIBLE,
        listEpisodes: async () => [EPISODE],
        getCredits: async () => ({ credits: CREDITS, history: [] })
      },
      'p-1'
    );
    expect(board).toEqual({
      status: 'ready',
      profile: null,
      bible: BIBLE,
      episodes: [EPISODE],
      credits: CREDITS,
      history: []
    });
  });

  it('distinguishes no Story Bible from missing project', async () => {
    const board = await loadStoryBoard(
      {
        getProjectProfile: async () => null,
        getStoryBible: async () => null,
        listEpisodes: async () => [],
        getCredits: async () => ({ credits: CREDITS, history: [] })
      },
      'p-1'
    );
    expect(board.status).toBe('ready');
    if (board.status === 'ready') expect(board.bible).toBeNull();
  });

  it('maps 401 to sign-in-required and 503 auth to not configured', async () => {
    const unauthorized = await loadStoryBoard(
      {
        getProjectProfile: async () => null,
        getStoryBible: async () => {
          throw new ApiError('unauthorized', 'no session', { status: 401 });
        },
        listEpisodes: async () => [],
        getCredits: async () => ({ credits: CREDITS, history: [] })
      },
      'p-1'
    );
    expect(unauthorized).toEqual({ status: 'sign_in_required' });

    const unconfigured = await loadStoryBoard(
      {
        getProjectProfile: async () => null,
        getStoryBible: async () => {
          throw new ApiError('not_configured', 'no provider', {
            status: 503,
            code: 'auth_not_configured'
          });
        },
        listEpisodes: async () => [],
        getCredits: async () => ({ credits: CREDITS, history: [] })
      },
      'p-1'
    );
    expect(unconfigured.status).toBe('auth_not_configured');
  });

  it('reports a retryable network failure without inventing data', async () => {
    const board = await loadStoryBoard(
      {
        getProjectProfile: async () => null,
        getStoryBible: async () => {
          throw new ApiError('network', 'offline');
        },
        listEpisodes: async () => [],
        getCredits: async () => ({ credits: CREDITS, history: [] })
      },
      'p-1'
    );
    expect(board).toEqual({
      status: 'error',
      message: 'Could not reach the server. Check your connection and try again.',
      retryable: true
    } satisfies StoryBoard);
  });
});

describe('generateContent', () => {
  const input = {
    type: 'story_bible' as const,
    idempotencyKey: 'key-test-0001',
    concept: 'A memory broker'
  };

  it('returns success only when the job succeeded with saved output', async () => {
    const result = await generateContent({ generate: async () => SUCCESS }, 'p-1', input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.credits.balance).toBe(90);
      expect(result.value.output?.kind).toBe('story_bible');
    }
  });

  it('refuses to treat a succeeded job without output as success', async () => {
    const result = await generateContent(
      { generate: async () => ({ ...SUCCESS, output: null }) },
      'p-1',
      input
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('did not return completed, saved content');
      expect(result.job?.status).toBe('succeeded');
    }
  });

  it('maps provider/credit failures and reads the failed job from the payload', async () => {
    const result = await generateContent(
      {
        generate: async () => {
          throw new ApiError('insufficient_credits', 'This generation costs 10 credits.', {
            status: 402,
            code: 'insufficient_credits',
            payload: { job: { ...JOB, status: 'failed', error_code: 'insufficient_credits' } }
          });
        }
      },
      'p-1',
      input
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('costs 10 credits');
      expect(result.retrySameKey).toBe(false);
      expect(result.job?.status).toBe('failed');
      expect(result.job?.error_code).toBe('insufficient_credits');
    }
  });

  it('keeps the idempotency key for an uncertain network failure but not a definitive one', async () => {
    const network = await generateContent(
      {
        generate: async () => {
          throw new ApiError('network', 'offline');
        }
      },
      'p-1',
      input
    );
    expect(!network.ok && network.retrySameKey).toBe(true);

    const provider = await generateContent(
      {
        generate: async () => {
          throw new ApiError('server', 'bad provider output', {
            status: 502,
            code: 'provider_bad_response'
          });
        }
      },
      'p-1',
      input
    );
    expect(!provider.ok && provider.retrySameKey).toBe(false);
    expect(!provider.ok && provider.message).toBe('bad provider output');
  });

  it('requires a concept before calling the server', async () => {
    let called = false;
    const result = await generateContent(
      {
        generate: async () => {
          called = true;
          return SUCCESS;
        }
      },
      'p-1',
      { ...input, concept: '   ' }
    );
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it('flags sign-in-required separately', async () => {
    const result = await generateContent(
      {
        generate: async () => {
          throw new ApiError('unauthorized', 'no session', { status: 401 });
        }
      },
      'p-1',
      input
    );
    expect(!result.ok && result.signInRequired).toBe(true);
    expect(!result.ok && result.message).toBe('Sign in required. Nothing was loaded or saved.');
  });
});

describe('editing and approval', () => {
  it('saves the project profile and returns the server record', async () => {
    const result = await saveProfile(
      {
        saveProjectProfile: async () => ({
          project_id: 'p-1',
          description: 'A noir thriller.',
          language: 'Korean',
          target_audience: 'Adults',
          updated_at: '2026-10-23T12:00:00Z'
        })
      },
      'p-1',
      { description: 'A noir thriller.', language: 'Korean', targetAudience: 'Adults' }
    );
    expect(result.ok && result.value.language).toBe('Korean');
  });

  it('reports a profile save failure without a record', async () => {
    const result = await saveProfile(
      {
        saveProjectProfile: async () => {
          throw new ApiError('network', 'offline');
        }
      },
      'p-1',
      { language: 'Korean' }
    );
    expect(result.ok).toBe(false);
  });

  it('validates required text before saving', async () => {
    let called = false;
    const result = await saveBibleEdit(
      {
        saveStoryBible: async () => {
          called = true;
          return BIBLE;
        }
      },
      'p-1',
      { ...bibleToInput(BIBLE), premise: '  ' }
    );
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it('returns the server-confirmed new version', async () => {
    const result = await saveBibleEdit(
      { saveStoryBible: async () => ({ ...BIBLE, version: 3 }) },
      'p-1',
      bibleToInput(BIBLE)
    );
    expect(result.ok && result.value.version).toBe(3);
  });

  it('returns the approved episode from the server', async () => {
    const result = await approveEpisode(
      { approveEpisode: async () => ({ ...EPISODE, status: 'approved' }) },
      'p-1',
      1
    );
    expect(result.ok && result.value.status).toBe('approved');
  });

  it('maps a conflict when approval is not allowed', async () => {
    const result = await approveEpisode(
      {
        approveEpisode: async () => {
          throw new ApiError('conflict', 'Only a ready-for-review episode can be approved.', {
            status: 409
          });
        }
      },
      'p-1',
      1
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('ready-for-review');
  });
});

describe('small helpers', () => {
  it('formats job labels without claiming success', () => {
    expect(jobLabel(null)).toBe('No job');
    expect(jobLabel({ ...JOB, status: 'running' })).toBe('Running');
    expect(jobLabel({ ...JOB, status: 'failed', error_code: 'provider_timeout' })).toBe(
      'Failed (provider_timeout)'
    );
  });

  it('splits lines and creates URL-safe keys', () => {
    expect(linesToArray(' a \n\n b ')).toEqual(['a', 'b']);
    const key = newIdempotencyKey();
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('maps every failure kind to an honest sentence', () => {
    expect(failureMessage(new ApiError('provider_not_configured', ''))).toContain(
      'no AI provider configured'
    );
    expect(failureMessage(new ApiError('invalid_response', ''))).toContain('unexpected response');
    expect(failureMessage(new Error('boom'))).toBe('The server could not be reached.');
  });
});

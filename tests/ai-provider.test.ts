import { describe, expect, it } from 'bun:test';
import type { Env } from '../worker/src/env';
import {
  AiProviderError,
  createGeminiProvider,
  providerFromEnv,
  type AiFetchLike,
  type AiFailureCode
} from '../worker/src/ai';

/**
 * Provider adapter tests (TASK 04). No network: fetch is injected. No live
 * generation is claimed here.
 */

const KEY = 'test-gemini-key';
const MODEL = 'test-model';

function fakeFetch(response: Response | (() => Promise<Response>)): {
  fetchImpl: AiFetchLike;
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: AiFetchLike = async (url, init) => {
    calls.push({ url, init });
    return typeof response === 'function' ? response() : response;
  };
  return { fetchImpl, calls };
}

function geminiText(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

async function expectFailure(
  response: Response | (() => Promise<Response>),
  code: AiFailureCode
): Promise<AiProviderError> {
  const { fetchImpl } = fakeFetch(response);
  const provider = createGeminiProvider({
    apiKey: KEY,
    model: MODEL,
    fetchImpl,
    timeoutMs: 50
  });
  const error = (await provider.generate('prompt').catch((e) => e)) as AiProviderError;
  expect(error).toBeInstanceOf(AiProviderError);
  expect(error.code).toBe(code);
  expect(error.message).not.toContain(KEY);
  return error;
}

describe('Gemini request shape', () => {
  it('sends the key in a header, bounded output config, and parses text', async () => {
    const { fetchImpl, calls } = fakeFetch(geminiText('{"ok":true}'));
    const provider = createGeminiProvider({
      apiKey: KEY,
      model: MODEL,
      fetchImpl,
      maxOutputTokens: 1234,
      timeoutMs: 5000
    });

    await expect(provider.generate('hello')).resolves.toBe('{"ok":true}');

    expect(provider.name).toBe('gemini');
    expect(provider.model).toBe(MODEL);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
    );
    expect(calls[0].url).not.toContain(KEY);

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe(KEY);
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(String(calls[0].init.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      generationConfig: { maxOutputTokens: number; responseMimeType: string };
    };
    expect(body.contents[0].parts[0].text).toBe('hello');
    expect(body.generationConfig.maxOutputTokens).toBe(1234);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('joins multiple text parts', async () => {
    const { fetchImpl } = fakeFetch(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }),
        { status: 200 }
      )
    );
    const provider = createGeminiProvider({ apiKey: KEY, model: MODEL, fetchImpl });
    await expect(provider.generate('x')).resolves.toBe('a\nb');
  });
});

describe('provider failures are typed and never leak the key', () => {
  it('401/403 -> provider_auth_failed', async () => {
    await expectFailure(new Response('denied', { status: 401 }), 'provider_auth_failed');
    await expectFailure(new Response('denied', { status: 403 }), 'provider_auth_failed');
  });

  it('429 -> provider_rate_limited', async () => {
    await expectFailure(new Response('slow down', { status: 429 }), 'provider_rate_limited');
  });

  it('5xx -> provider_unavailable', async () => {
    await expectFailure(new Response('down', { status: 503 }), 'provider_unavailable');
  });

  it('other non-2xx -> provider_bad_response', async () => {
    await expectFailure(new Response('bad', { status: 400 }), 'provider_bad_response');
  });

  it('invalid JSON -> provider_bad_response', async () => {
    await expectFailure(new Response('not json', { status: 200 }), 'provider_bad_response');
  });

  it('missing candidates/text -> provider_bad_response', async () => {
    await expectFailure(
      new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
      'provider_bad_response'
    );
  });

  it('network rejection -> provider_unavailable', async () => {
    await expectFailure(
      async () => {
        throw new TypeError('offline');
      },
      'provider_unavailable'
    );
  });

  it('a hanging call becomes provider_timeout even if it ignores the abort signal', async () => {
    const error = await expectFailure(
      () => new Promise<Response>(() => undefined),
      'provider_timeout'
    );
    expect(error.message).toContain('50 ms');
  });
});

describe('provider configuration', () => {
  it('is absent unless both key and explicit model exist', () => {
    expect(providerFromEnv({} as Env)).toBeNull();
    expect(providerFromEnv({ GEMINI_API_KEY: KEY } as Env)).toBeNull();
    expect(providerFromEnv({ GEMINI_MODEL: MODEL } as Env)).toBeNull();
  });

  it('builds the configured provider without inventing a model', () => {
    const provider = providerFromEnv({
      GEMINI_API_KEY: KEY,
      GEMINI_MODEL: MODEL
    } as Env);
    expect(provider?.name).toBe('gemini');
    expect(provider?.model).toBe(MODEL);
  });
});

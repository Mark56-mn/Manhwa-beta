import type { Env } from './env';

/**
 * Server-side AI provider gateway (TASK 04).
 *
 * - The API key is a Worker secret/binding and is sent in a header, never in a
 *   URL, log, response, job record or browser bundle.
 * - Requests are bounded by a timeout and a max output-token limit.
 * - Failures are typed so routes can answer honestly and refund reservations.
 * - There is exactly one configured provider here; no silent fallback exists.
 *   Adding a compatible fallback requires a second explicitly configured
 *   provider (not invented by this code).
 */

export type AiFailureCode =
  | 'provider_not_configured'
  | 'provider_auth_failed'
  | 'provider_rate_limited'
  | 'provider_timeout'
  | 'provider_bad_response'
  | 'provider_unavailable';

export class AiProviderError extends Error {
  readonly code: AiFailureCode;

  constructor(code: AiFailureCode, message: string) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
  }
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Returns the raw model text. Callers validate the content shape. */
  generate(prompt: string): Promise<string>;
}

export type AiFetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface GeminiProviderConfig {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetchImpl?: AiFetchLike;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const MAX_TEXT_CHARS = 200_000;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createGeminiProvider(config: GeminiProviderConfig): AiProvider {
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  const apiKey = config.apiKey;
  const model = config.model;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputTokens = config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const fetchImpl: AiFetchLike = config.fetchImpl ?? ((input, init) => fetch(input, init));

  return {
    name: 'gemini',
    model,

    async generate(prompt: string): Promise<string> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      // The race guarantees a bound even if the transport ignores the abort
      // signal; the abort still lets a well-behaved transport stop its work.
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new AiProviderError(
              'provider_timeout',
              `The AI provider did not answer within ${timeoutMs} ms.`
            )
          );
        }, timeoutMs);
      });

      try {
        const response = await Promise.race([
          fetchImpl(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Header transport keeps the key out of URLs and access logs.
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens,
                responseMimeType: 'application/json'
              }
            }),
            signal: controller.signal
          }),
          timeout
        ]);

        if (response.status === 401 || response.status === 403) {
          throw new AiProviderError(
            'provider_auth_failed',
            'The AI provider rejected the server credential.'
          );
        }
        if (response.status === 429) {
          throw new AiProviderError(
            'provider_rate_limited',
            'The AI provider is rate limiting requests. Try again later.'
          );
        }
        if (response.status >= 500) {
          throw new AiProviderError(
            'provider_unavailable',
            'The AI provider is temporarily unavailable.'
          );
        }
        if (!response.ok) {
          throw new AiProviderError(
            'provider_bad_response',
            `The AI provider rejected the request (HTTP ${response.status}).`
          );
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new AiProviderError('provider_bad_response', 'The AI provider returned invalid JSON.');
        }

        const text = extractText(payload);
        if (!text || text.trim().length === 0) {
          throw new AiProviderError('provider_bad_response', 'The AI provider returned no text.');
        }
        if (text.length > MAX_TEXT_CHARS) {
          throw new AiProviderError('provider_bad_response', 'The AI provider returned too much text.');
        }
        return text;
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        if ((error as { name?: string })?.name === 'AbortError') {
          throw new AiProviderError(
            'provider_timeout',
            `The AI provider did not answer within ${timeoutMs} ms.`
          );
        }
        throw new AiProviderError(
          'provider_unavailable',
          'The AI provider could not be reached.'
        );
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  };
}

function extractText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const content = (candidates[0] as { content?: unknown })?.content;
  const parts = (content as { parts?: unknown })?.parts;
  if (!Array.isArray(parts)) return null;
  const texts = parts
    .map((part) =>
      typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : ''
    )
    .filter((value) => value.length > 0);
  return texts.length > 0 ? texts.join('\n') : null;
}

/**
 * Build the provider from Worker configuration. Both the key and an explicit
 * model are required: no default model is invented, and absence is an honest
 * `provider_not_configured` before any job or charge exists.
 */
export function providerFromEnv(env: Env): AiProvider | null {
  const key = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim();
  if (!key || !model) return null;
  return createGeminiProvider({
    apiKey: key,
    model,
    timeoutMs: positiveInteger(env.AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxOutputTokens: positiveInteger(env.AI_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS)
  });
}

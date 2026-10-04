// Google Gemini client for stage 03, as an alternative to Claude. It calls the
// REST generateContent endpoint with plain fetch (no SDK) and asks for JSON
// that matches a response schema. Every item is still validated with Zod
// before it is written.
//
// Free-tier rate limits depend on the Google project and are not published per
// model, so requests go one at a time, spaced out, and back off on HTTP 429.
// On the free tier a model can also answer 503 "high demand" for minutes while
// an older one works (seen 2026-09-27), so each request falls back through a
// list of Flash models. When every model is out, the stage ends early:
// everything written so far is saved, and the next run fills the rest.

import { parseGeneratedSense, type GeneratedSense } from './schema.ts';

/** Tried in order for each request. Override with GEMINI_MODEL (comma-separated). */
export const GEMINI_DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'];

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Paid standard-tier USD per 1M tokens (ai.google.dev/gemini-api/docs/pricing,
// read 2026-09-27; 3.8 Flash doubles on 2027-01-01). The free tier costs
// nothing, so the run summary labels this "if billed".
export const GEMINI_PRICING: Record<string, { in: number; out: number }> = {
  'gemini-3.8-flash': { in: 0.75, out: 3.75 },
  'gemini-3.5-flash-lite': { in: 0.3, out: 2.5 },
};

/** Response schema in the API's Schema format (OpenAPI subset). */
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          sense_id: { type: 'INTEGER' },
          plain_language_definition: { type: 'STRING' },
          examples: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                text: { type: 'STRING' },
                cloze_target: { type: 'STRING' },
              },
              required: ['text', 'cloze_target'],
            },
          },
          distractors: { type: 'ARRAY', items: { type: 'STRING' } },
          mnemonic: { type: 'STRING', nullable: true },
        },
        required: ['sense_id', 'plain_language_definition', 'examples', 'distractors'],
      },
    },
  },
  required: ['items'],
} as const;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Split a batch response into validated senses. An item is kept only if its
 * sense_id was asked for and it passes the same Zod schema as Claude's output.
 * Anything missing or invalid is reported, so the caller can retry it.
 */
export function parseBatchResponse(
  text: string,
  askedFor: number[],
): { valid: Map<number, GeneratedSense>; failed: number[]; errors: string[] } {
  const valid = new Map<number, GeneratedSense>();
  const errors: string[] = [];
  let items: unknown[] = [];
  try {
    const parsed = JSON.parse(text) as { items?: unknown };
    if (Array.isArray(parsed.items)) items = parsed.items;
    else errors.push('response has no items array');
  } catch (err) {
    errors.push(`not valid JSON: ${(err as Error).message}`);
  }
  const wanted = new Set(askedFor);
  for (const item of items) {
    const result = parseGeneratedSense(JSON.stringify(item));
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    if (!wanted.has(result.value.sense_id)) {
      errors.push(`unexpected sense_id ${result.value.sense_id}`);
      continue;
    }
    valid.set(result.value.sense_id, result.value);
  }
  const failed = askedFor.filter((id) => !valid.has(id));
  return { valid, failed, errors };
}

export type RateLimit =
  | { kind: 'retry'; delayMs: number }
  | { kind: 'daily'; message: string };

/**
 * Read a 429 body. A quota whose id mentions a day cannot clear by waiting a
 * minute; anything else is retried after the server's RetryInfo delay, or
 * `fallbackMs` when it gives none.
 */
export function classifyRateLimit(body: string, fallbackMs: number): RateLimit {
  let message = body.slice(0, 300);
  let delayMs = fallbackMs;
  let daily = false;
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        details?: {
          '@type'?: string;
          retryDelay?: string;
          violations?: { quotaId?: string }[];
        }[];
      };
    };
    message = parsed.error?.message ?? message;
    for (const d of parsed.error?.details ?? []) {
      if (d.retryDelay) {
        const seconds = Number.parseFloat(d.retryDelay);
        if (Number.isFinite(seconds)) delayMs = Math.ceil(seconds * 1000);
      }
      if (d.violations?.some((v) => /day/i.test(v.quotaId ?? ''))) daily = true;
    }
  } catch {
    // Not JSON: fall back to the defaults above.
  }
  return daily ? { kind: 'daily', message } : { kind: 'retry', delayMs };
}

export class DailyQuotaError extends Error {}

/** Still rate limited or overloaded (HTTP 429 or 5xx) after every retry. */
export class GeminiUnavailableError extends Error {}

export interface GeminiCall {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  /** Response schema; defaults to the stage 03 fill schema. */
  responseSchema?: object;
}

export interface GeminiResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** One generateContent call with JSON output, retrying rate limits and 5xx. */
export async function generateJson(
  call: GeminiCall,
  onWait: (message: string) => void,
  maxAttempts = 6,
  baseDelayMs = 5_000,
): Promise<GeminiResult> {
  const url = `${ENDPOINT}/${encodeURIComponent(call.model)}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: call.system }] },
    contents: [{ role: 'user', parts: [{ text: call.prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: call.responseSchema ?? GEMINI_RESPONSE_SCHEMA,
      temperature: 0.7,
    },
  });

  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': call.apiKey },
      body,
    });
    const text = await res.text();

    if (res.ok) {
      const json = JSON.parse(text) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          thoughtsTokenCount?: number;
        };
      };
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const out = parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('');
      const u = json.usageMetadata ?? {};
      return {
        text: out,
        inputTokens: u.promptTokenCount ?? 0,
        // Thinking tokens are billed as output.
        outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
      };
    }

    const backoffMs = Math.min(120_000, baseDelayMs * 2 ** (attempt - 1));
    if (res.status === 429) {
      const limit = classifyRateLimit(text, backoffMs);
      if (limit.kind === 'daily') throw new DailyQuotaError(limit.message);
      if (attempt >= maxAttempts) {
        throw new GeminiUnavailableError(`rate limit persisted: ${text.slice(0, 300)}`);
      }
      onWait(`rate limited; waiting ${Math.round(limit.delayMs / 1000)}s`);
      await sleep(limit.delayMs);
      continue;
    }
    if (res.status >= 500) {
      // 503 "high demand" spikes are common and pass on their own.
      if (attempt >= maxAttempts) {
        throw new GeminiUnavailableError(`HTTP ${res.status} persisted: ${text.slice(0, 300)}`);
      }
      onWait(`Gemini HTTP ${res.status}; retrying in ${Math.round(backoffMs / 1000)}s`);
      await sleep(backoffMs);
      continue;
    }
    // 400 (bad request, bad model name), 401/403 (key) and the rest are not
    // worth retrying.
    throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
}

/**
 * Try each model in turn until one answers. A model that is overloaded or
 * rate limited is skipped for this request only, since those spells pass. A
 * model whose daily quota is spent goes into `spent` and is skipped for the
 * rest of the run. Throws DailyQuotaError when every model is spent, and
 * GeminiUnavailableError when none answered.
 */
export async function generateJsonWithFallback(
  models: string[],
  call: Omit<GeminiCall, 'model'>,
  spent: Set<string>,
  onWait: (message: string) => void,
  attemptsPerModel = 3,
  baseDelayMs = 5_000,
): Promise<GeminiResult & { model: string }> {
  const reasons: string[] = [];
  for (const model of models) {
    if (spent.has(model)) continue;
    try {
      const result = await generateJson(
        { ...call, model },
        (m) => onWait(`${model}: ${m}`),
        attemptsPerModel,
        baseDelayMs,
      );
      return { ...result, model };
    } catch (err) {
      if (err instanceof DailyQuotaError) {
        spent.add(model);
        reasons.push(`${model}: daily quota`);
        onWait(`${model} daily quota spent; trying the next model`);
      } else if (err instanceof GeminiUnavailableError) {
        reasons.push(`${model}: ${err.message.slice(0, 80)}`);
        onWait(`${model} unavailable; trying the next model`);
      } else {
        throw err;
      }
    }
  }
  if (models.every((m) => spent.has(m))) {
    throw new DailyQuotaError(`every model's daily quota is spent (${models.join(', ')})`);
  }
  throw new GeminiUnavailableError(`no model answered: ${reasons.join('; ')}`);
}

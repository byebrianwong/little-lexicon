import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunk,
  classifyRateLimit,
  DailyQuotaError,
  generateJson,
  parseBatchResponse,
} from './gemini.ts';

function sense(senseId: number, overrides: Record<string, unknown> = {}) {
  return {
    sense_id: senseId,
    plain_language_definition: 'Short-lived.',
    examples: [
      { text: 'An ephemeral fame.', cloze_target: 'ephemeral' },
      { text: 'Ephemeral joys fade.', cloze_target: 'Ephemeral' },
      { text: 'Its ephemeral glow faded.', cloze_target: 'ephemeral' },
    ],
    distractors: ['Very old.', 'Very loud.', 'Very rich.', 'Very slow.'],
    mnemonic: null,
    ...overrides,
  };
}

test('chunk splits into fixed-size groups', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 8), []);
});

test('parseBatchResponse keeps valid senses and reports the rest', () => {
  const text = JSON.stringify({
    items: [
      sense(1),
      sense(2, { distractors: ['Only one.'] }), // too few distractors
      sense(99), // not asked for
    ],
  });
  const out = parseBatchResponse(text, [1, 2, 3]);
  assert.deepEqual([...out.valid.keys()], [1]);
  assert.deepEqual(out.failed, [2, 3]);
  assert.equal(out.errors.length, 2);
});

test('parseBatchResponse fails every sense on unreadable output', () => {
  assert.deepEqual(parseBatchResponse('not json', [4, 5]).failed, [4, 5]);
  assert.deepEqual(parseBatchResponse('{"nope": []}', [4]).failed, [4]);
});

test('classifyRateLimit reads the retry delay and spots a daily quota', () => {
  const perMinute = JSON.stringify({
    error: {
      message: 'Quota exceeded',
      details: [
        { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '31s' },
      ],
    },
  });
  assert.deepEqual(classifyRateLimit(perMinute, 5000), { kind: 'retry', delayMs: 31000 });

  const perDay = JSON.stringify({
    error: {
      message: 'Daily quota exceeded',
      details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
    },
  });
  assert.deepEqual(classifyRateLimit(perDay, 5000), { kind: 'daily', message: 'Daily quota exceeded' });

  assert.deepEqual(classifyRateLimit('<html>busy</html>', 7000), { kind: 'retry', delayMs: 7000 });
});

// --- generateJson against a fake fetch -------------------------------------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('no more fake responses');
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as typeof fetch;
  return calls;
}

const call = { apiKey: 'test-key', model: 'gemini-test', system: 'sys', prompt: 'prompt' };

test('generateJson returns the text and counts thinking tokens as output', async () => {
  const calls = fakeFetch([
    {
      status: 200,
      body: {
        candidates: [
          { content: { parts: [{ text: 'thinking...', thought: true }, { text: '{"items":[]}' }] } },
        ],
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40, thoughtsTokenCount: 10 },
      },
    },
  ]);
  const out = await generateJson(call, () => {});
  assert.deepEqual(out, { text: '{"items":[]}', inputTokens: 120, outputTokens: 50 });
  assert.match(calls[0]!.url, /models\/gemini-test:generateContent$/);
  const headers = calls[0]!.init?.headers as Record<string, string>;
  assert.equal(headers['x-goog-api-key'], 'test-key', 'the key goes in a header, not the URL');
});

test('generateJson waits out a per-minute limit and retries', async () => {
  fakeFetch([
    { status: 429, body: { error: { message: 'slow down', details: [{ retryDelay: '0.01s' }] } } },
    { status: 200, body: { candidates: [{ content: { parts: [{ text: '{}' }] } }] } },
  ]);
  const waits: string[] = [];
  const out = await generateJson(call, (m) => waits.push(m));
  assert.equal(out.text, '{}');
  assert.equal(waits.length, 1);
});

test('generateJson stops on a daily quota and on a bad request', async () => {
  fakeFetch([
    {
      status: 429,
      body: { error: { message: 'daily', details: [{ violations: [{ quotaId: 'RequestsPerDay' }] }] } },
    },
  ]);
  await assert.rejects(generateJson(call, () => {}), DailyQuotaError);

  fakeFetch([{ status: 400, body: { error: { message: 'model not found' } } }]);
  await assert.rejects(generateJson(call, () => {}), /Gemini HTTP 400/);
});

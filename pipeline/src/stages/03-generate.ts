// Stage 03 (task 1.3): LLM generation, with Claude or Gemini.
//
// For each sense that still lacks it, generate a plain-language definition,
// 3-5 erudite example sentences (each with a cloze_target token), 4-6
// distractors, and one global mnemonic per word. A distractor is a wrong
// definition: the app's word-to-definition question shows it next to the real
// one (task 3.3), so it has to read like a definition. Live mode uses the Anthropic
// Batch API (50% off) with claude-haiku-4-5, a prompt-cached shared instruction
// prefix, and escalation to claude-sonnet-5 for items Haiku keeps getting wrong.
// With only GEMINI_API_KEY set, Gemini writes the same content instead: eight
// senses per request, written and saved as each request returns, so a daily
// quota stops the stage without losing work (see lib/gemini.ts). Dry-run uses
// deterministic stubs. A live run with neither key skips this stage. Every item
// is Zod-validated before any write; malformed items are rejected and retried,
// never inserted.

import Anthropic from '@anthropic-ai/sdk';
import type { RunContext } from '../config.ts';
import type { SenseRow, WordRow } from '../lib/types.ts';
import {
  GeneratedSenseSchema,
  parseGeneratedSense,
  type GeneratedSense,
} from '../lib/schema.ts';
import { stubGenerate } from '../lib/stubs.ts';
import {
  chunk,
  DailyQuotaError,
  GEMINI_PRICING,
  GeminiUnavailableError,
  generateJsonWithFallback,
  parseBatchResponse,
} from '../lib/gemini.ts';

const HAIKU = 'claude-haiku-4-5';
const SONNET = 'claude-sonnet-5';
const MAX_OUTPUT_TOKENS = 1024;
const POLL_INTERVAL_MS = 10_000;

// Per-million-token USD pricing (SPEC section 7). Batch API is 50% off; cached
// input tokens bill at ~10% of the input rate.
const PRICING: Record<string, { in: number; out: number }> = {
  [HAIKU]: { in: 1, out: 5 },
  [SONNET]: { in: 2, out: 10 },
};

/** The fields and rules for one sense, shared by the Claude and Gemini prompts. */
const SENSE_CONTRACT = `{
  "sense_id": <the integer sense id you were given>,
  "plain_language_definition": <one clear sentence a teenager could understand>,
  "examples": [
    { "text": <an erudite, natural sentence that uses the word>, "cloze_target": <the exact word token as it appears in text> }
  ],
  "distractors": [ <wrong definitions, each written like the dictionary definition you were given> ],
  "mnemonic": <a short memory aid, or null>
}

Rules:
- Provide between 3 and 5 examples. Each cloze_target MUST appear verbatim (case-insensitive) inside its own text.
- Provide between 4 and 6 distractors. Each is a wrong definition that a learner could mistake for this sense: often the meaning of a word that looks or sounds similar, or a plausible guess from the word's parts. Match the dictionary definition in length and style: start with a capital letter, end with a period, and do not use the word itself. None may mean the same thing as the dictionary definition.
- Include a mnemonic string only when asked; otherwise set "mnemonic" to null.
- No em dashes. Keep sentences precise and free of hype.`;

/** Stable, cacheable instruction prefix. Keep this identical across items. */
const PROMPT_PREFIX = `You generate study content for a vocabulary app. You will be given ONE dictionary sense of an English word.

Return ONLY a single JSON object. No prose, no markdown, no code fences.

JSON schema:
${SENSE_CONTRACT}`;

/** Gemini gets several senses per request. */
export const GEMINI_SYSTEM = `You generate study content for a vocabulary app. You will be given several dictionary senses of English words, separated by lines containing only ---. Treat each sense on its own.

Return ONLY a JSON object of the form {"items": [...]} with one object per sense, in the order given. No prose, no markdown, no code fences.

Each object in "items":
${SENSE_CONTRACT}`;

const GEMINI_BATCH_SIZE = 8;
const GEMINI_REQUEST_GAP_MS = 4_000; // at most 15 requests a minute

interface Needs {
  plainDef: boolean;
  examples: boolean;
  distractors: boolean;
  mnemonic: boolean;
  any: boolean;
}

interface GenItem {
  word: WordRow;
  sense: SenseRow;
  needs: Needs;
}

function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function claudeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  const p = PRICING[model] ?? PRICING[HAIKU]!;
  const batch = 0.5;
  const freshIn = Math.max(0, inputTokens - cachedInputTokens);
  const inCost = (freshIn / 1e6) * p.in * batch + (cachedInputTokens / 1e6) * p.in * 0.1 * batch;
  const outCost = (outputTokens / 1e6) * p.out * batch;
  return inCost + outCost;
}

async function computeNeeds(
  ctx: RunContext,
  word: WordRow,
  sense: SenseRow,
  isPrimary: boolean,
): Promise<Needs> {
  const examples = await ctx.store.listExamplesForSense(sense.id);
  const generatedCount = examples.filter((e) => e.is_generated).length;
  const distractors = await ctx.store.listDistractorsForSense(sense.id);
  let mnemonic = false;
  if (isPrimary) {
    const existing = await ctx.store.listMnemonicsForWord(word.id);
    mnemonic = existing.filter((m) => m.user_id === null).length === 0;
  }
  const plainDef = sense.plain_language_definition === null;
  const needExamples = generatedCount < 3;
  const needDistractors = distractors.length < 4;
  return {
    plainDef,
    examples: needExamples,
    distractors: needDistractors,
    mnemonic,
    any: plainDef || needExamples || needDistractors || mnemonic,
  };
}

export function buildUserPrompt(item: GenItem): string {
  const { word, sense, needs } = item;
  return [
    `Word: ${word.headword}`,
    `Part of speech: ${word.part_of_speech ?? 'unknown'}`,
    `Sense id: ${sense.id}`,
    `Dictionary definition: ${sense.definition}`,
    ``,
    needs.mnemonic
      ? `Include a mnemonic for this word.`
      : `Set "mnemonic" to null for this sense.`,
    `Return the JSON object now.`,
  ].join('\n');
}

// --- Live Claude batch path ---

interface BatchOutcome {
  valid: Map<number, GeneratedSense>;
  failedSenseIds: number[];
}

function extractText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

async function runBatch(
  ctx: RunContext,
  client: Anthropic,
  items: GenItem[],
  model: string,
): Promise<BatchOutcome> {
  const requests: Anthropic.Messages.Batches.BatchCreateParams.Request[] = items.map((item) => ({
    custom_id: `sense-${item.sense.id}`,
    params: {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [
        {
          type: 'text',
          text: PROMPT_PREFIX,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: buildUserPrompt(item) }],
    },
  }));

  ctx.log.info(`Submitting batch of ${requests.length} items to ${model}.`);
  let batch = await client.messages.batches.create({ requests });

  while (batch.processing_status !== 'ended') {
    ctx.log.debug(`batch ${batch.id}: ${batch.processing_status}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    batch = await client.messages.batches.retrieve(batch.id);
  }

  const valid = new Map<number, GeneratedSense>();
  const failedSenseIds: number[] = [];
  const results = await client.messages.batches.results(batch.id);
  for await (const entry of results) {
    const senseId = Number.parseInt(entry.custom_id.replace('sense-', ''), 10);
    if (entry.result.type !== 'succeeded') {
      ctx.log.warn(`batch item ${entry.custom_id}: ${entry.result.type}`);
      failedSenseIds.push(senseId);
      continue;
    }
    const message = entry.result.message;
    const usage = message.usage;
    const cached = usage.cache_read_input_tokens ?? 0;
    ctx.metrics.llmInputTokens += usage.input_tokens + cached;
    ctx.metrics.llmOutputTokens += usage.output_tokens;
    ctx.metrics.llmCostUsd += claudeCostUsd(
      model,
      usage.input_tokens + cached,
      usage.output_tokens,
      cached,
    );
    const parsed = parseGeneratedSense(extractText(message));
    if (!parsed.ok) {
      ctx.log.warn(`sense ${senseId} failed validation: ${parsed.error}`);
      failedSenseIds.push(senseId);
      continue;
    }
    valid.set(senseId, parsed.value);
  }
  return { valid, failedSenseIds };
}

async function generateWithClaude(
  ctx: RunContext,
  items: GenItem[],
): Promise<Map<number, GeneratedSense>> {
  const client = new Anthropic({ apiKey: ctx.env.anthropicKey! });
  const byId = new Map(items.map((i) => [i.sense.id, i]));
  const out = new Map<number, GeneratedSense>();

  // Pass 1: Haiku for everything.
  let outcome = await runBatch(ctx, client, items, HAIKU);
  for (const [id, v] of outcome.valid) out.set(id, v);

  // Pass 2: retry the failures once, still on Haiku.
  let failed = outcome.failedSenseIds;
  if (failed.length > 0) {
    const retryItems = failed.map((id) => byId.get(id)!).filter(Boolean);
    outcome = await runBatch(ctx, client, retryItems, HAIKU);
    for (const [id, v] of outcome.valid) out.set(id, v);
    failed = outcome.failedSenseIds;
  }

  // Pass 3: escalate the stubborn ones to Sonnet.
  if (failed.length > 0) {
    ctx.metrics.escalatedToSonnet += failed.length;
    const escalateItems = failed.map((id) => byId.get(id)!).filter(Boolean);
    outcome = await runBatch(ctx, client, escalateItems, SONNET);
    for (const [id, v] of outcome.valid) out.set(id, v);
    failed = outcome.failedSenseIds;
  }

  if (failed.length > 0) {
    ctx.metrics.invalidRejected += failed.length;
    ctx.log.warn(`${failed.length} senses still invalid after Sonnet; leaving gaps: ${failed.join(', ')}`);
  }
  return out;
}

// --- Live Gemini path ---

async function generateWithGemini(ctx: RunContext, items: GenItem[]): Promise<void> {
  const models = ctx.env.geminiModels;
  const spent = new Set<string>(); // models whose daily quota ran out this run
  const usedBy = new Map<string, number>(); // model -> senses written
  const byId = new Map(items.map((i) => [i.sense.id, i]));
  let written = 0;
  let pending = items;

  // Pass 1 sends eight senses per request. Passes 2 and 3 retry what failed,
  // one sense per request, so one bad item cannot sink its neighbours again.
  for (let pass = 1; pass <= 3 && pending.length > 0; pass += 1) {
    const batches = chunk(pending, pass === 1 ? GEMINI_BATCH_SIZE : 1);
    const failed: GenItem[] = [];
    for (const [index, batch] of batches.entries()) {
      if (index > 0 || pass > 1) await new Promise((r) => setTimeout(r, GEMINI_REQUEST_GAP_MS));
      let result;
      try {
        result = await generateJsonWithFallback(
          models,
          {
            apiKey: ctx.env.geminiKey!,
            system: GEMINI_SYSTEM,
            prompt: batch.map(buildUserPrompt).join('\n---\n'),
          },
          spent,
          (message) => ctx.log.info(`Gemini ${message}`),
        );
      } catch (err) {
        // Neither clears by retrying now. Stop the stage but keep the run
        // going, so what was written is saved and exported.
        if (err instanceof DailyQuotaError || err instanceof GeminiUnavailableError) {
          const why = err instanceof DailyQuotaError ? 'daily quota reached' : 'still unavailable';
          ctx.log.warn(
            `Gemini ${why} after ${written} of ${items.length} senses. Everything written so far ` +
              `is saved; run the pipeline again later to fill the rest. (${err.message})`,
          );
          return;
        }
        throw err;
      }

      ctx.metrics.llmInputTokens += result.inputTokens;
      ctx.metrics.llmOutputTokens += result.outputTokens;
      const price = GEMINI_PRICING[result.model];
      if (price) {
        ctx.metrics.llmCostUsd +=
          (result.inputTokens / 1e6) * price.in + (result.outputTokens / 1e6) * price.out;
      }

      const parsed = parseBatchResponse(
        result.text,
        batch.map((b) => b.sense.id),
      );
      for (const [senseId, gen] of parsed.valid) {
        await writeGenerated(ctx, byId.get(senseId)!, gen);
        written += 1;
      }
      usedBy.set(result.model, (usedBy.get(result.model) ?? 0) + parsed.valid.size);
      for (const senseId of parsed.failed) failed.push(byId.get(senseId)!);
      if (parsed.errors.length > 0) {
        ctx.log.debug(`pass ${pass} batch ${index + 1}: ${parsed.errors.join('; ')}`);
      }
      await ctx.store.flush(); // keep progress if the run stops
      if ((index + 1) % 10 === 0 || index === batches.length - 1) {
        ctx.log.info(`Gemini pass ${pass}: ${index + 1}/${batches.length} requests, ${written} senses written.`);
      }
    }
    pending = failed;
  }

  if (usedBy.size > 0) {
    ctx.log.info(
      `Gemini models used: ${[...usedBy].map(([m, n]) => `${m} ${n} senses`).join(', ')}.`,
    );
  }
  if (pending.length > 0) {
    ctx.metrics.invalidRejected += pending.length;
    ctx.log.warn(
      `${pending.length} senses still invalid after three passes; leaving gaps: ` +
        pending.map((p) => p.word.headword).join(', '),
    );
  }
}

// --- Dry-run stub path ---

function generateWithStub(
  ctx: RunContext,
  items: GenItem[],
): Map<number, GeneratedSense> {
  const prefixTokens = estTokens(PROMPT_PREFIX);
  const out = new Map<number, GeneratedSense>();
  for (const item of items) {
    const candidate = stubGenerate(item.sense.id, item.word.headword, item.needs.mnemonic);
    // Validate stub output too, so the validate-before-write gate is exercised.
    const parsed = GeneratedSenseSchema.safeParse(candidate);
    if (!parsed.success) {
      ctx.metrics.invalidRejected += 1;
      ctx.log.warn(`stub for sense ${item.sense.id} failed validation (unexpected)`);
      continue;
    }
    out.set(item.sense.id, parsed.data);

    const inputTokens = prefixTokens + estTokens(buildUserPrompt(item));
    const outputTokens = estTokens(JSON.stringify(parsed.data));
    ctx.metrics.llmInputTokens += inputTokens;
    ctx.metrics.llmOutputTokens += outputTokens;
    ctx.metrics.llmCostUsd += claudeCostUsd(HAIKU, inputTokens, outputTokens, prefixTokens);
  }
  return out;
}

/** Provenance for generated rows. Dry-run stubs keep 'claude', as before. */
function generatedBy(ctx: RunContext): 'claude' | 'gemini' {
  return ctx.llm === 'gemini' ? 'gemini' : 'claude';
}

async function writeGenerated(
  ctx: RunContext,
  item: GenItem,
  gen: GeneratedSense,
): Promise<void> {
  const { word, sense, needs } = item;

  if (needs.plainDef) {
    await ctx.store.setPlainDefinition(sense.id, gen.plain_language_definition);
    ctx.metrics.plainDefsWritten += 1;
  }

  if (needs.examples) {
    for (const ex of gen.examples) {
      await ctx.store.insertExample({
        sense_id: sense.id,
        text: ex.text,
        audio_url: null,
        cloze_target: ex.cloze_target,
        source: generatedBy(ctx),
        is_generated: true,
      });
      ctx.metrics.generatedExamples += 1;
    }
  }

  if (needs.distractors) {
    for (const lemma of gen.distractors) {
      await ctx.store.insertDistractor({
        sense_id: sense.id,
        distractor_lemma: lemma,
        kind: 'mc',
        difficulty: word.difficulty_tier,
        source: generatedBy(ctx),
      });
      ctx.metrics.distractorsInserted += 1;
    }
  }

  if (needs.mnemonic && gen.mnemonic) {
    await ctx.store.insertMnemonic({
      word_id: word.id,
      text: gen.mnemonic,
      source: generatedBy(ctx),
      user_id: null,
    });
    ctx.metrics.mnemonicsInserted += 1;
  }
}

export async function generate(ctx: RunContext): Promise<void> {
  ctx.log.stage('03 generate with an LLM');
  const allWords = await ctx.store.listWords();
  const words = ctx.limit ? allWords.slice(0, ctx.limit) : allWords;

  const items: GenItem[] = [];
  for (const word of words) {
    const senses = await ctx.store.listSensesForWord(word.id);
    for (let i = 0; i < senses.length; i += 1) {
      const sense = senses[i]!;
      const needs = await computeNeeds(ctx, word, sense, i === 0);
      if (needs.any) items.push({ word, sense, needs });
    }
  }

  if (items.length === 0) {
    ctx.log.success('Generate: nothing to do, all senses already complete.');
    return;
  }
  if (!ctx.dryRun && ctx.llm === null) {
    ctx.log.warn(
      `Generate: skipped. ${items.length} senses need content, and neither ANTHROPIC_API_KEY ` +
        `nor GEMINI_API_KEY is set in pipeline/.env.`,
    );
    return;
  }

  const via =
    ctx.llm === 'claude'
      ? 'Claude batch'
      : ctx.llm === 'gemini'
        ? `Gemini (${ctx.env.geminiModels.join(', then ')})`
        : 'dry-run stubs';
  ctx.log.info(`Generating for ${items.length} senses via ${via}.`);

  if (ctx.llm === 'gemini') {
    await generateWithGemini(ctx, items); // writes and saves as it goes
  } else {
    const generated =
      ctx.llm === 'claude' ? await generateWithClaude(ctx, items) : generateWithStub(ctx, items);
    for (const item of items) {
      const gen = generated.get(item.sense.id);
      if (!gen) continue; // rejected after retries; leave the gap
      await writeGenerated(ctx, item, gen);
    }
  }

  await ctx.store.flush();
  ctx.log.success(
    `Generate: +${ctx.metrics.plainDefsWritten} plain defs, +${ctx.metrics.generatedExamples} examples, ` +
      `+${ctx.metrics.distractorsInserted} distractors, +${ctx.metrics.mnemonicsInserted} mnemonics. ` +
      `Rejected ${ctx.metrics.invalidRejected}. Est. cost $${ctx.metrics.llmCostUsd.toFixed(4)} if billed.`,
  );
}

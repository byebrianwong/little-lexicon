// Stage "revise": replace the quiz wrong answers and the memory hook of each
// word with better ones (lib/revise.ts). Run it by name:
//
//   npx tsx src/run.ts --only=revise, then --only=export
//
// It covers each word's first sense only, because multiple choice shows only
// that sense's wrong answers. It uses Gemini, and by default only the stronger
// models (GEMINI_MODEL overrides), since better quality is the reason to run
// it. Words already revised are skipped, so a run that stops at a daily quota
// continues on the next run.

import type { RunContext } from '../config.ts';
import type { SenseRow, WordRow } from '../lib/types.ts';
import {
  chunk,
  DailyQuotaError,
  GEMINI_PRICING,
  GeminiUnavailableError,
  generateJsonWithFallback,
} from '../lib/gemini.ts';
import { ensureWordNet, loadWordNet, partsOfSpeechOf } from '../lib/wordnet.ts';
import {
  buildRevisePrompt,
  parseRevisedBatch,
  REVISE_RESPONSE_SCHEMA,
  REVISE_SYSTEM,
  REVISION,
  type Lexicon,
  type ReviseItem,
} from '../lib/revise.ts';

/** The models worth a second pass. Flash-lite wrote the first one. */
const REVISE_DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash'];
const BATCH_SIZE = 16;
const REQUEST_GAP_MS = 4_000;

interface Target {
  word: WordRow;
  sense: SenseRow;
  item: ReviseItem;
}

export async function revise(ctx: RunContext): Promise<void> {
  ctx.log.stage('03 revise wrong answers and memory hooks');
  if (ctx.dryRun || ctx.llm !== 'gemini') {
    ctx.log.warn(
      'Revise: skipped. It needs a live run with GEMINI_API_KEY set and no ANTHROPIC_API_KEY.',
    );
    return;
  }
  const models = ctx.env.geminiModelsSet ? ctx.env.geminiModels : REVISE_DEFAULT_MODELS;

  // Wrong answers already written by this pass, so no two words share one.
  const taken = new Set<string>();
  const snapshot = await ctx.store.snapshot();
  for (const d of snapshot.distractors) {
    if (d.revision === REVISION) taken.add(d.distractor_lemma.trim().toLowerCase());
  }

  const allWords = await ctx.store.listWords();
  const words = ctx.limit ? allWords.slice(0, ctx.limit) : allWords;
  const targets: Target[] = [];
  for (const word of words) {
    const senses = await ctx.store.listSensesForWord(word.id);
    const sense = [...senses].sort((a, b) => a.sense_order - b.sense_order || a.id - b.id)[0];
    if (!sense) continue;
    const distractors = await ctx.store.listDistractorsForSense(sense.id);
    const mnemonics = (await ctx.store.listMnemonicsForWord(word.id)).filter((m) => m.user_id === null);
    const distractorsDone = distractors.length > 0 && distractors.every((d) => d.revision === REVISION);
    const hookDone = mnemonics.some((m) => m.revision === REVISION);
    if (distractorsDone && hookDone) continue;
    targets.push({
      word,
      sense,
      item: {
        senseId: sense.id,
        headword: word.headword,
        partOfSpeech: word.part_of_speech,
        definition: sense.definition,
        plainDefinition: sense.plain_language_definition,
        needsMnemonic: !hookDone,
      },
    });
  }

  if (targets.length === 0) {
    ctx.log.success('Revise: nothing to do, every word is already revised.');
    return;
  }
  ctx.log.info(`Revising ${targets.length} words with ${models.join(', then ')}.`);

  // WordNet checks that each look-alike is a real word with the target's part
  // of speech.
  const wordnet = loadWordNet(await ensureWordNet(ctx.paths.cacheDir, ctx.log));
  const lexicon: Lexicon = (lemma) => partsOfSpeechOf(wordnet, lemma);

  const bySense = new Map(targets.map((t) => [t.sense.id, t]));
  const spent = new Set<string>(); // models whose daily quota ran out this run
  let pending = targets;
  let written = 0;
  let requests = 0;

  // Pass 1 sends 16 words per request; passes 2 and 3 retry failures one by one.
  for (let pass = 1; pass <= 3 && pending.length > 0; pass += 1) {
    const batches = chunk(pending, pass === 1 ? BATCH_SIZE : 1);
    const failed: Target[] = [];
    for (const [index, batch] of batches.entries()) {
      if (requests > 0) await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
      requests += 1;
      let result;
      try {
        result = await generateJsonWithFallback(
          models,
          {
            apiKey: ctx.env.geminiKey!,
            system: REVISE_SYSTEM,
            prompt: batch.map((t) => buildRevisePrompt(t.item)).join('\n---\n'),
            responseSchema: REVISE_RESPONSE_SCHEMA,
          },
          spent,
          (message) => ctx.log.info(`Gemini ${message}`),
        );
      } catch (err) {
        if (err instanceof DailyQuotaError || err instanceof GeminiUnavailableError) {
          ctx.log.warn(
            `Revise stopped after ${written} of ${targets.length} words: ${err.message}. ` +
              `Everything written so far is saved; run --only=revise again later to continue.`,
          );
          await ctx.store.flush();
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

      const parsed = parseRevisedBatch(
        result.text,
        batch.map((t) => t.item),
        taken,
        lexicon,
      );
      for (const [senseId, revised] of parsed.valid) {
        const target = bySense.get(senseId)!;
        await ctx.store.replaceDistractors(
          senseId,
          revised.distractors.map((d) => ({
            sense_id: senseId,
            distractor_lemma: d.meaning,
            kind: 'mc',
            difficulty: target.word.difficulty_tier,
            source: 'gemini',
            revision: REVISION,
            lookalike: d.word,
          })),
        );
        if (revised.mnemonic) {
          await ctx.store.replaceGlobalMnemonic(target.word.id, {
            word_id: target.word.id,
            text: revised.mnemonic,
            source: 'gemini',
            user_id: null,
            revision: REVISION,
          });
          ctx.metrics.mnemonicsInserted += 1;
        }
        ctx.metrics.distractorsInserted += revised.distractors.length;
        ctx.metrics.sensesRevised += 1;
        written += 1;
      }
      for (const senseId of parsed.failed) failed.push(bySense.get(senseId)!);
      if (parsed.errors.length > 0) {
        ctx.log.debug(`pass ${pass} request ${index + 1} (${result.model}): ${parsed.errors.join(' | ')}`);
      }
      await ctx.store.flush();
      if ((index + 1) % 5 === 0 || index === batches.length - 1) {
        ctx.log.info(
          `Revise pass ${pass}: ${index + 1}/${batches.length} requests, ${written} words written ` +
            `(last by ${result.model}).`,
        );
      }
    }
    pending = failed;
  }

  if (pending.length > 0) {
    ctx.metrics.invalidRejected += pending.length;
    ctx.log.warn(
      `${pending.length} words failed the checks three times and keep their old content: ` +
        pending.map((t) => t.word.headword).join(', '),
    );
  }
  ctx.log.success(`Revise: ${written} of ${targets.length} words revised.`);
}

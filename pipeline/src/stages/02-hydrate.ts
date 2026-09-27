// Stage 02 (task 1.2): hydrate senses, relations, and real example sentences.
//
// Live mode reads Open English WordNet (SPEC.md section 5): definitions,
// dictionary examples that use the headword, synonyms, antonyms, and a US
// pronunciation. Datamuse's part-of-speech order picks which part of speech a
// word is taught as; only that part of speech's senses are kept. Dry-run uses
// deterministic stubs.
//
// Writes senses, word_relations, and real example_sentences (is_generated=false)
// with source 'wordnet'. Idempotent: a word that already has senses is skipped.
// A word WordNet does not have gets no senses and is left out of the export; it
// is never filled with stub text in live mode.

import type { RunContext } from '../config.ts';
import type { ContentSource, RelationType, WordRow } from '../lib/types.ts';
import { stubHydrate } from '../lib/stubs.ts';
import { datamuseLookup } from '../lib/datamuse.ts';
import { ensureWordNet, loadWordNet, lookupWord, type WordNetData } from '../lib/wordnet.ts';

const LIMITS = {
  maxSenses: 3,
  maxExamplesPerSense: 2,
  maxRelationsPerType: 6,
};

interface HydratedSense {
  definition: string;
  examples: { text: string; clozeTarget: string | null }[];
}

interface Hydration {
  partOfSpeech: string | null;
  ipa: string | null;
  senses: HydratedSense[];
  synonyms: string[];
  antonyms: string[];
  source: ContentSource;
}

async function hydrateLive(
  ctx: RunContext,
  wordnet: WordNetData,
  word: string,
): Promise<Hydration | null> {
  let posPreference: string[] = [];
  try {
    posPreference = (await datamuseLookup(ctx.http, word)).partsOfSpeech;
  } catch (err) {
    ctx.log.warn(
      `Datamuse lookup failed for "${word}"; choosing its part of speech by sense count: ` +
        (err as Error).message,
    );
  }
  const result = lookupWord(wordnet, word, posPreference, LIMITS);
  if (!result) return null;
  return {
    partOfSpeech: result.partOfSpeech,
    ipa: result.ipa,
    senses: result.senses,
    synonyms: result.synonyms,
    antonyms: result.antonyms,
    source: 'wordnet',
  };
}

function hydrateStub(word: string): Hydration {
  const s = stubHydrate(word);
  return {
    partOfSpeech: s.partOfSpeech,
    ipa: s.ipa,
    senses: [
      {
        definition: s.definition,
        examples: [{ text: s.example.text, clozeTarget: s.example.clozeTarget }],
      },
    ],
    synonyms: s.synonyms,
    antonyms: s.antonyms,
    source: 'wordnet', // stub stands in for the WordNet backbone
  };
}

async function hydrateWord(
  ctx: RunContext,
  wordnet: WordNetData | null,
  word: WordRow,
): Promise<void> {
  const existing = await ctx.store.listSensesForWord(word.id);
  if (existing.length > 0) {
    ctx.metrics.sensesSkipped += existing.length;
    return; // already hydrated
  }

  const hydration = wordnet
    ? await hydrateLive(ctx, wordnet, word.headword)
    : hydrateStub(word.headword);
  if (!hydration) {
    ctx.log.warn(`WordNet has no entry for "${word.headword}"; it will not be exported.`);
    return;
  }

  await ctx.store.updateWordMeta(word.id, {
    part_of_speech: hydration.partOfSpeech,
    ipa: hydration.ipa,
  });

  let order = 1;
  for (const sense of hydration.senses) {
    const senseRow = await ctx.store.insertSense({
      word_id: word.id,
      definition: sense.definition,
      plain_language_definition: null,
      sense_order: order,
      register: null,
    });
    ctx.metrics.sensesInserted += 1;
    order += 1;

    for (const example of sense.examples) {
      await ctx.store.insertExample({
        sense_id: senseRow.id,
        text: example.text,
        audio_url: null,
        cloze_target: example.clozeTarget,
        source: hydration.source,
        is_generated: false,
      });
      ctx.metrics.realExamples += 1;
    }
  }

  const relationPlan: Array<[RelationType, string[]]> = [
    ['synonym', hydration.synonyms],
    ['antonym', hydration.antonyms],
  ];
  for (const [relationType, lemmas] of relationPlan) {
    for (const lemma of lemmas) {
      await ctx.store.insertRelation({
        word_id: word.id,
        related_lemma: lemma,
        relation_type: relationType,
        source: hydration.source,
      });
      ctx.metrics.relationsInserted += 1;
    }
  }
}

export async function hydrate(ctx: RunContext): Promise<void> {
  ctx.log.stage('02 hydrate senses, relations, examples');
  const allWords = await ctx.store.listWords();
  const words = ctx.limit ? allWords.slice(0, ctx.limit) : allWords;

  let wordnet: WordNetData | null = null;
  if (!ctx.dryRun) {
    let pending = 0;
    for (const w of words) {
      if ((await ctx.store.listSensesForWord(w.id)).length === 0) pending += 1;
    }
    if (pending === 0) {
      ctx.log.success('Hydrate: nothing to do, every word already has senses.');
      return;
    }
    const dir = await ensureWordNet(ctx.paths.cacheDir, ctx.log);
    ctx.log.info('Loading Open English WordNet.');
    wordnet = loadWordNet(dir);
  }
  ctx.log.info(`Hydrating ${words.length} words.`);

  let processed = 0;
  for (const word of words) {
    await hydrateWord(ctx, wordnet, word);
    processed += 1;
    if (processed % 25 === 0) ctx.log.debug(`hydrated ${processed}/${words.length}`);
  }

  await ctx.store.flush();
  ctx.log.success(
    `Hydrate: +${ctx.metrics.sensesInserted} senses, +${ctx.metrics.relationsInserted} relations, ` +
      `+${ctx.metrics.realExamples} real examples.`,
  );
}

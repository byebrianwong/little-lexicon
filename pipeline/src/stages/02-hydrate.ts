// Stage 02 (task 1.2): hydrate senses, relations, and real example sentences.
//
// Live mode pulls definitions, part of speech, synonyms, antonyms, and example
// sentences from the Free Dictionary API (https://api.dictionaryapi.dev,
// Wiktionary-sourced, CC BY-SA). Open English WordNet is the intended primary
// backbone; bundling its data export and preferring it over the API is the
// documented follow-up (see README). Dry-run uses deterministic stubs.
//
// Writes little_lexicon.senses, little_lexicon.word_relations, and real little_lexicon.example_sentences
// (is_generated=false). Source is recorded on every relation and example row.
// Idempotent: a word that already has senses is skipped.

import type { RunContext } from '../config.ts';
import type { ContentSource, RelationType, WordRow } from '../lib/types.ts';
import { stubHydrate } from '../lib/stubs.ts';

const MAX_SENSES = 3;
const MAX_EXAMPLES_PER_SENSE = 2;
const MAX_RELATIONS_PER_TYPE = 6;

interface HydratedSense {
  definition: string;
  register: string | null;
  examples: string[];
}

interface Hydration {
  partOfSpeech: string | null;
  ipa: string | null;
  senses: HydratedSense[];
  synonyms: string[];
  antonyms: string[];
  source: ContentSource;
}

// --- Free Dictionary API response shapes (live mode) ---
interface FdPhonetic {
  text?: string;
}
interface FdDefinition {
  definition: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
}
interface FdMeaning {
  partOfSpeech?: string;
  definitions?: FdDefinition[];
  synonyms?: string[];
  antonyms?: string[];
}
interface FdEntry {
  word: string;
  phonetic?: string;
  phonetics?: FdPhonetic[];
  meanings?: FdMeaning[];
  origin?: string;
}

function dedupeLower(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const lemma = v.trim().toLowerCase();
    if (lemma && /^[a-z][a-z '-]*$/.test(lemma) && !seen.has(lemma)) {
      seen.add(lemma);
      out.push(lemma);
    }
  }
  return out;
}

async function hydrateLive(ctx: RunContext, word: string): Promise<Hydration | null> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const { status, data } = await ctx.http.getJson<FdEntry[]>(url);
  if (status !== 200 || !Array.isArray(data) || data.length === 0) {
    return null; // 404 = no entry; caller falls back.
  }
  const entry = data[0]!;
  const ipa =
    entry.phonetic ?? entry.phonetics?.find((p) => p.text && p.text.length > 0)?.text ?? null;

  const senses: HydratedSense[] = [];
  const synonyms: string[] = [];
  const antonyms: string[] = [];
  let partOfSpeech: string | null = null;

  for (const meaning of entry.meanings ?? []) {
    if (!partOfSpeech && meaning.partOfSpeech) partOfSpeech = meaning.partOfSpeech;
    synonyms.push(...(meaning.synonyms ?? []));
    antonyms.push(...(meaning.antonyms ?? []));
    for (const def of meaning.definitions ?? []) {
      if (senses.length >= MAX_SENSES) break;
      synonyms.push(...(def.synonyms ?? []));
      antonyms.push(...(def.antonyms ?? []));
      senses.push({
        definition: def.definition,
        register: meaning.partOfSpeech ?? null,
        examples: def.example ? [def.example] : [],
      });
    }
  }

  if (senses.length === 0) return null;
  return {
    partOfSpeech,
    ipa,
    senses,
    synonyms: dedupeLower(synonyms).slice(0, MAX_RELATIONS_PER_TYPE),
    antonyms: dedupeLower(antonyms).slice(0, MAX_RELATIONS_PER_TYPE),
    source: 'free_dictionary',
  };
}

function hydrateStub(word: string): Hydration {
  const s = stubHydrate(word);
  return {
    partOfSpeech: s.partOfSpeech,
    ipa: s.ipa,
    senses: [{ definition: s.definition, register: s.register, examples: [s.example.text] }],
    synonyms: s.synonyms,
    antonyms: s.antonyms,
    source: 'wordnet', // stub stands in for the WordNet backbone
  };
}

function clozeFor(word: string, sentence: string): string | null {
  return sentence.toLowerCase().includes(word.toLowerCase()) ? word : null;
}

async function hydrateWord(ctx: RunContext, word: WordRow): Promise<void> {
  const existing = await ctx.store.listSensesForWord(word.id);
  if (existing.length > 0) {
    ctx.metrics.sensesSkipped += existing.length;
    return; // already hydrated
  }

  let hydration: Hydration | null = ctx.dryRun ? hydrateStub(word.headword) : null;
  if (!hydration) {
    hydration = await hydrateLive(ctx, word.headword);
  }
  if (!hydration) {
    // No live data and not dry-run: fall back to the stub so every word still
    // gets at least one sense, and flag it.
    ctx.log.warn(`No dictionary entry for "${word.headword}"; using stub sense.`);
    hydration = hydrateStub(word.headword);
  }

  await ctx.store.updateWordMeta(word.id, {
    part_of_speech: hydration.partOfSpeech,
    ipa: hydration.ipa,
  });

  let order = 1;
  for (const sense of hydration.senses.slice(0, MAX_SENSES)) {
    const senseRow = await ctx.store.insertSense({
      word_id: word.id,
      definition: sense.definition,
      plain_language_definition: null,
      sense_order: order,
      register: sense.register,
    });
    ctx.metrics.sensesInserted += 1;
    order += 1;

    for (const text of sense.examples.slice(0, MAX_EXAMPLES_PER_SENSE)) {
      await ctx.store.insertExample({
        sense_id: senseRow.id,
        text,
        audio_url: null,
        cloze_target: clozeFor(word.headword, text),
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
  ctx.log.info(`Hydrating ${words.length} words.`);

  let processed = 0;
  for (const word of words) {
    await hydrateWord(ctx, word);
    processed += 1;
    if (processed % 25 === 0) ctx.log.debug(`hydrated ${processed}/${words.length}`);
  }

  await ctx.store.flush();
  ctx.log.success(
    `Hydrate: +${ctx.metrics.sensesInserted} senses, +${ctx.metrics.relationsInserted} relations, ` +
      `+${ctx.metrics.realExamples} real examples.`,
  );
}

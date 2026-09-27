// Turn the pipeline's record into the words file the app bundles
// (src/content/words.json), and check that no word's id changed.
//
// The file's shape matches the app's WordContent type (src/lib/types.ts). The
// pipeline does not import app code, so the shape is repeated here; the app's
// src/lib/content tests check the committed file against the app's type.

import type {
  DistractorRow,
  ExampleRow,
  MnemonicRow,
  RelationRow,
  SenseRow,
  WordRow,
} from './types.ts';

export const WORDS_FILE_FORMAT = 1;

export interface ExportExample {
  exampleId: number;
  text: string;
  audioUrl: string | null;
  clozeTarget: string | null;
}

/** `lemma` holds a wrong definition; the name matches the app's DistractorContent. */
export interface ExportDistractor {
  lemma: string;
  kind: string;
  difficulty: number;
}

export interface ExportSense {
  senseId: number;
  definition: string;
  plainLanguageDefinition: string | null;
  senseOrder: number;
  register: string | null;
  examples: ExportExample[];
  distractors: ExportDistractor[];
}

export interface ExportRelation {
  relatedLemma: string;
  relationType: 'synonym' | 'antonym' | 'hypernym' | 'hyponym';
}

export interface ExportWord {
  wordId: number;
  headword: string;
  partOfSpeech: string | null;
  ipa: string | null;
  syllables: number | null;
  difficultyTier: number;
  frequencyRank: number | null;
  etymology: string | null;
  audioUrl: string | null;
  senses: ExportSense[];
  relations: ExportRelation[];
  mnemonics: string[];
}

export interface WordsFile {
  formatVersion: number;
  attribution: string[];
  words: ExportWord[];
}

export interface ContentRows {
  words: WordRow[];
  senses: SenseRow[];
  example_sentences: ExampleRow[];
  word_relations: RelationRow[];
  mnemonics: MnemonicRow[];
  distractors: DistractorRow[];
}

export interface HeldBack {
  headword: string;
  reason: string;
}

const RELATION_TYPES = new Set(['synonym', 'antonym', 'hypernym', 'hyponym']);

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}

const byId = (a: { id: number }, b: { id: number }): number => a.id - b.id;

/**
 * Build the words file. A word is exported when it has at least one sense;
 * everything else (plain definition, generated examples, distractors,
 * mnemonic) is optional, and the app works around what is missing.
 * Generated example sentences come before dictionary examples, because the app
 * shows a sense's first example.
 */
export function buildWordsFile(
  rows: ContentRows,
  attribution: string[],
): { file: WordsFile; heldBack: HeldBack[] } {
  const sensesByWord = groupBy(rows.senses, (s) => s.word_id);
  const examplesBySense = groupBy(rows.example_sentences, (e) => e.sense_id);
  const distractorsBySense = groupBy(rows.distractors, (d) => d.sense_id);
  const relationsByWord = groupBy(rows.word_relations, (r) => r.word_id);
  const mnemonicsByWord = groupBy(
    rows.mnemonics.filter((m) => m.user_id === null),
    (m) => m.word_id,
  );

  const words: ExportWord[] = [];
  const heldBack: HeldBack[] = [];
  for (const word of [...rows.words].sort(byId)) {
    const senses = [...(sensesByWord.get(word.id) ?? [])].sort(
      (a, b) => a.sense_order - b.sense_order || a.id - b.id,
    );
    if (senses.length === 0) {
      heldBack.push({ headword: word.headword, reason: 'no senses' });
      continue;
    }
    words.push({
      wordId: word.id,
      headword: word.headword,
      partOfSpeech: word.part_of_speech,
      ipa: word.ipa,
      syllables: word.syllables,
      difficultyTier: word.difficulty_tier,
      frequencyRank: word.frequency_rank,
      etymology: word.etymology,
      audioUrl: word.audio_url,
      senses: senses.map((s) => ({
        senseId: s.id,
        definition: s.definition,
        plainLanguageDefinition: s.plain_language_definition,
        senseOrder: s.sense_order,
        register: s.register,
        examples: [...(examplesBySense.get(s.id) ?? [])]
          .sort((a, b) => Number(b.is_generated) - Number(a.is_generated) || a.id - b.id)
          .map((e) => ({
            exampleId: e.id,
            text: e.text,
            audioUrl: e.audio_url,
            clozeTarget: e.cloze_target,
          })),
        distractors: [...(distractorsBySense.get(s.id) ?? [])].sort(byId).map((d) => ({
          lemma: d.distractor_lemma,
          kind: d.kind,
          difficulty: d.difficulty,
        })),
      })),
      relations: [...(relationsByWord.get(word.id) ?? [])]
        .sort(byId)
        .filter((r) => RELATION_TYPES.has(r.relation_type))
        .map((r) => ({ relatedLemma: r.related_lemma, relationType: r.relation_type })),
      mnemonics: [...(mnemonicsByWord.get(word.id) ?? [])].sort(byId).map((m) => m.text),
    });
  }

  return { file: { formatVersion: WORDS_FILE_FORMAT, attribution, words }, heldBack };
}

/**
 * Compare a new export with the one the app already has. Saved progress points
 * at word ids, so a headword must keep its id, and an id must keep its
 * headword. Returns the problems (the export must not be written if there are
 * any) and the words that are no longer exported.
 */
export function checkIdStability(
  previous: Pick<ExportWord, 'wordId' | 'headword'>[],
  next: Pick<ExportWord, 'wordId' | 'headword'>[],
): { problems: string[]; removed: string[] } {
  const prevByHeadword = new Map(previous.map((w) => [w.headword, w.wordId]));
  const prevById = new Map(previous.map((w) => [w.wordId, w.headword]));
  const nextIds = new Set(next.map((w) => w.wordId));

  const problems: string[] = [];
  for (const w of next) {
    const oldId = prevByHeadword.get(w.headword);
    if (oldId !== undefined && oldId !== w.wordId) {
      problems.push(`"${w.headword}" moved from id ${oldId} to ${w.wordId}`);
    }
    const oldHeadword = prevById.get(w.wordId);
    if (oldHeadword !== undefined && oldHeadword !== w.headword) {
      problems.push(`id ${w.wordId} changed from "${oldHeadword}" to "${w.headword}"`);
    }
  }
  const removed = previous.filter((w) => !nextIds.has(w.wordId)).map((w) => w.headword);
  return { problems, removed };
}

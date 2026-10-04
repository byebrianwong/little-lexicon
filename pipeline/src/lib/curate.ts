// Curation: improving word entries inside a Claude Code session, with no paid
// API. The session's own model reads a worksheet of entries, rewrites what is
// weak, scores each entry against a rubric, and hands the worksheet back. This
// module holds the worksheet format and the checks a worksheet must pass before
// it is applied. The process is described in .claude/skills/improve-words.
//
// The checks catch what code can catch: giveaways, made-up look-alike words,
// repeated wrong answers, cloze targets missing from their sentence, house
// style. Whether a sentence is natural or a hook is helpful stays a judgment,
// which is what the rubric scores record.

import { findWordToken, isOffensive } from './wordnet.ts';
import type { Lexicon } from './revise.ts';
import type { ContentRows } from './exportContent.ts';
import type { SenseRow, WordRow } from './types.ts';

/** Bump when the rubric changes in a way that makes old reviews stale. */
export const RUBRIC_VERSION = 1;

/** Rows written by curation. Gemini's revise pass wrote 2. */
export const CURATED_REVISION = 3;

export const CRITERIA = [
  'sense',
  'definition',
  'plain',
  'examples',
  'wrongAnswers',
  'hook',
  'related',
] as const;
export type Criterion = (typeof CRITERIA)[number];

/** A score below this on any criterion means the entry is not done. */
export const PASS_SCORE = 4;

export type Verdict = 'pass' | 'fixed' | 'flagged';

export interface WorksheetEntry {
  // Read-only context.
  wordId: number;
  headword: string;
  tier: number;
  otherSenses: string[];
  // Editable content. All of it is about the word's first sense, which is the
  // one every screen and game uses.
  partOfSpeech: string;
  definition: string;
  plain: string;
  examples: { text: string; cloze: string }[];
  wrongAnswers: { lookalike: string; meaning: string }[];
  hook: string;
  synonyms: string[];
  antonyms: string[];
  /** What the checks found in the record's current content (read-only). */
  problems?: string[];
  // Filled in by the reviewer.
  review: {
    scores: Partial<Record<Criterion, number>> | null;
    verdict: Verdict | null;
    notes: string;
  };
}

export interface Worksheet {
  rubricVersion: number;
  createdAt: string;
  instructions: string;
  words: WorksheetEntry[];
}

export const WORKSHEET_INSTRUCTIONS =
  'Edit the content fields of each word, then fill in review.scores (1 to 5 for every ' +
  'criterion), review.verdict and review.notes. The rubric is in ' +
  '.claude/skills/improve-words/SKILL.md. Check with `npx tsx src/curate.ts check <file>`, ' +
  'then apply with `npx tsx src/curate.ts apply <file>`.';

export const PARTS_OF_SPEECH = ['noun', 'verb', 'adjective', 'adverb'];

const key = (s: string): string => s.trim().toLowerCase();
const article = (noun: string): string => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
const letters = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '');
const isSentence = (s: string): boolean => /^[A-Z"']/.test(s.trim()) && /[.!?]["']?$/.test(s.trim());
const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

export interface CheckEnv {
  lexicon: Lexicon;
  /** Wrong answers (lowercased) already used by words outside this worksheet, to their word id. */
  takenWrongAnswers: Map<string, number>;
}

/** Content problems: anything that would be wrong to ship. */
export function checkContent(entry: WorksheetEntry, env: CheckEnv): string[] {
  const p: string[] = [];
  const word = entry.headword;
  const mentions = (text: string): boolean => findWordToken(text, word) !== null;

  const content = { ...entry, problems: undefined, review: undefined };
  if (JSON.stringify(content).includes('\u2014')) p.push('contains an em dash');
  if (!PARTS_OF_SPEECH.includes(entry.partOfSpeech)) {
    p.push(`partOfSpeech must be one of ${PARTS_OF_SPEECH.join(', ')}`);
  }

  // Definitions. The plain definition is the prompt of the "which word means"
  // question, so naming the word there gives the answer away.
  if (!isSentence(entry.definition) || entry.definition.length < 10 || entry.definition.length > 220) {
    p.push('definition must be one sentence of 10 to 220 characters, capitalized, ending in a period');
  }
  if (mentions(entry.definition)) p.push('definition names the word');
  if (!isSentence(entry.plain) || entry.plain.length < 10 || entry.plain.length > 180) {
    p.push('plain must be one sentence of 10 to 180 characters, capitalized, ending in a period');
  }
  if (mentions(entry.plain)) p.push('plain names the word, which gives away the "which word means" question');
  if (key(entry.plain) === key(entry.definition)) p.push('plain is the same as definition');

  // Examples feed the cloze game: the target is blanked out of the sentence.
  if (entry.examples.length < 3 || entry.examples.length > 5) p.push('need 3 to 5 examples');
  const texts = new Set<string>();
  for (const ex of entry.examples) {
    const where = `example "${ex.text.slice(0, 40)}"`;
    if (!isSentence(ex.text)) p.push(`${where} must be a capitalized sentence with end punctuation`);
    const n = wordCount(ex.text);
    if (n < 6 || n > 35) p.push(`${where} must be 6 to 35 words (has ${n})`);
    const token = findWordToken(ex.text, word);
    if (!token) p.push(`${where} does not use the word`);
    else if (ex.cloze !== token) p.push(`${where}: cloze must be "${token}", the word as written`);
    if (texts.has(key(ex.text))) p.push(`${where} is repeated`);
    texts.add(key(ex.text));
  }

  // Wrong answers: real meanings of real look-alike words, same part of speech.
  if (entry.wrongAnswers.length < 4 || entry.wrongAnswers.length > 6) p.push('need 4 to 6 wrong answers');
  const lookalikes = new Set<string>();
  const meanings = new Set<string>();
  const correct = new Set([key(entry.definition), key(entry.plain)]);
  for (const wa of entry.wrongAnswers) {
    const lk = key(wa.lookalike);
    const m = wa.meaning.trim();
    if (!lk) p.push(`wrong answer "${m.slice(0, 40)}" has no lookalike word`);
    else {
      if (letters(lk) === letters(word) || findWordToken(lk, word)) p.push(`lookalike "${wa.lookalike}" is the word itself`);
      const pos = env.lexicon(lk);
      if (!pos) p.push(`lookalike "${wa.lookalike}" is not in WordNet (use a real word, base form)`);
      else if (!pos.includes(entry.partOfSpeech)) {
        p.push(`lookalike "${wa.lookalike}" is ${article(pos.join('/'))}, not ${article(entry.partOfSpeech)}`);
      }
      if (lookalikes.has(lk)) p.push(`lookalike "${wa.lookalike}" is used twice`);
      lookalikes.add(lk);
    }
    if (!isSentence(m) || m.length < 8 || m.length > 200) p.push(`wrong answer "${m.slice(0, 40)}" must be a capitalized sentence of 8 to 200 characters`);
    if (mentions(m)) p.push(`wrong answer "${m.slice(0, 40)}" names the word`);
    if (correct.has(key(m))) p.push(`wrong answer "${m.slice(0, 40)}" is the correct definition`);
    if (meanings.has(key(m))) p.push(`wrong answer "${m.slice(0, 40)}" is repeated`);
    meanings.add(key(m));
    const owner = env.takenWrongAnswers.get(key(m));
    if (owner !== undefined && owner !== entry.wordId) p.push(`wrong answer "${m.slice(0, 40)}" is already used by word ${owner}`);
  }

  // Memory hook.
  const hook = entry.hook.trim();
  if (hook.length < 20 || hook.length > 240) p.push('hook must be 20 to 240 characters');
  if (!letters(hook).includes(letters(word))) p.push('hook must name the word');

  // Related words appear as answer options in the synonym and antonym games.
  const seenRelated = new Set<string>();
  for (const [label, list] of [['synonym', entry.synonyms], ['antonym', entry.antonyms]] as const) {
    if (list.length > 6) p.push(`at most 6 ${label}s`);
    for (const lemma of list) {
      const l = key(lemma);
      if (l !== lemma) p.push(`${label} "${lemma}" must be lowercase and trimmed`);
      if (letters(l) === letters(word)) p.push(`${label} "${lemma}" is the word itself`);
      if (isOffensive(l)) p.push(`${label} "${lemma}" is offensive`);
      if (!env.lexicon(l)) p.push(`${label} "${lemma}" is not in WordNet`);
      if (seenRelated.has(l)) p.push(`"${lemma}" is listed twice across synonyms and antonyms`);
      seenRelated.add(l);
    }
  }
  return p;
}

/** Review problems: the scores and verdict must be filled in and consistent. */
export function checkReview(entry: WorksheetEntry, changed: string[]): string[] {
  const p: string[] = [];
  const { scores, verdict, notes } = entry.review;
  if (!scores) return ['review.scores is not filled in'];
  for (const c of CRITERIA) {
    const s = scores[c];
    if (s === undefined) p.push(`review.scores.${c} is missing`);
    else if (!Number.isInteger(s) || s < 1 || s > 5) p.push(`review.scores.${c} must be a whole number from 1 to 5`);
  }
  if (verdict !== 'pass' && verdict !== 'fixed' && verdict !== 'flagged') {
    p.push('review.verdict must be "pass", "fixed" or "flagged"');
    return p;
  }
  const low = CRITERIA.filter((c) => (scores[c] ?? 0) < PASS_SCORE);
  if (verdict !== 'flagged' && low.length > 0) {
    p.push(`verdict "${verdict}" needs every score at ${PASS_SCORE} or more; low: ${low.join(', ')}. Fix them or flag the word.`);
  }
  if (verdict === 'flagged' && notes.trim().length < 15) p.push('a flagged word needs notes saying what is still wrong');
  if (verdict === 'pass' && changed.length > 0) p.push(`verdict "pass" but these fields changed: ${changed.join(', ')}; use "fixed"`);
  if (verdict === 'fixed' && changed.length === 0) p.push('verdict "fixed" but nothing changed; use "pass"');
  return p;
}

/** Which content fields differ between the record's entry and the edited one. */
export function changedFields(before: WorksheetEntry, after: WorksheetEntry): string[] {
  const fields: (keyof WorksheetEntry)[] = [
    'partOfSpeech',
    'definition',
    'plain',
    'examples',
    'wrongAnswers',
    'hook',
    'synonyms',
    'antonyms',
  ];
  return fields.filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
}

const byId = (a: { id: number }, b: { id: number }): number => a.id - b.id;

/** A word's first sense: the one every screen and game uses. */
export function primarySense(rows: Pick<ContentRows, 'senses'>, wordId: number): SenseRow | undefined {
  return rows.senses
    .filter((s) => s.word_id === wordId)
    .sort((a, b) => a.sense_order - b.sense_order || a.id - b.id)[0];
}

/** The record's current content for one word, as a worksheet entry. */
export function buildEntry(rows: ContentRows, word: WordRow): WorksheetEntry {
  const primary = primarySense(rows, word.id);
  if (!primary) throw new Error(`"${word.headword}" has no senses`);
  const others = rows.senses
    .filter((s) => s.word_id === word.id && s.id !== primary.id)
    .sort((a, b) => a.sense_order - b.sense_order || a.id - b.id);
  const relations = rows.word_relations.filter((r) => r.word_id === word.id).sort(byId);
  const hook = rows.mnemonics
    .filter((m) => m.word_id === word.id && m.user_id === null)
    .sort(byId)
    .at(-1);
  return {
    wordId: word.id,
    headword: word.headword,
    tier: word.difficulty_tier,
    otherSenses: others.map((s) => s.definition),
    partOfSpeech: word.part_of_speech ?? '',
    definition: primary.definition,
    plain: primary.plain_language_definition ?? '',
    // Generated sentences first, the order the app shows them in.
    examples: rows.example_sentences
      .filter((e) => e.sense_id === primary.id)
      .sort((a, b) => Number(b.is_generated) - Number(a.is_generated) || a.id - b.id)
      .map((e) => ({ text: e.text, cloze: e.cloze_target ?? '' })),
    wrongAnswers: rows.distractors
      .filter((d) => d.sense_id === primary.id)
      .sort(byId)
      .map((d) => ({ lookalike: d.lookalike ?? '', meaning: d.distractor_lemma })),
    hook: hook?.text ?? '',
    synonyms: relations.filter((r) => r.relation_type === 'synonym').map((r) => r.related_lemma),
    antonyms: relations.filter((r) => r.relation_type === 'antonym').map((r) => r.related_lemma),
    review: { scores: null, verdict: null, notes: '' },
  };
}

/** Each word's first-sense wrong answers (lowercased), to that word's id. */
export function wrongAnswerOwners(rows: ContentRows, skipWordIds: Set<number>): Map<string, number> {
  const owners = new Map<string, number>();
  for (const word of rows.words) {
    if (skipWordIds.has(word.id)) continue;
    const primary = primarySense(rows, word.id);
    if (!primary) continue;
    for (const d of rows.distractors) {
      if (d.sense_id === primary.id) owners.set(key(d.distractor_lemma), word.id);
    }
  }
  return owners;
}

/** Short problem labels with the quoted text removed, for counting. */
export function problemKind(problem: string): string {
  return problem.replace(/"[^"]*"/g, '…').replace(/\(has \d+\)/, '').replace(/\d+/g, 'N').trim();
}

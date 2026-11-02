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
import type { ReviewRow, SenseRow, WordRow } from './types.ts';
import type { ReportNote } from './reports.ts';

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
  // Editable content. Most of it is about the word's first sense, which is
  // the one every screen and game uses.
  partOfSpeech: string;
  definition: string;
  plain: string;
  examples: { text: string; cloze: string }[];
  wrongAnswers: { lookalike: string; meaning: string }[];
  hook: string;
  synonyms: string[];
  antonyms: string[];
  /** Definitions of the word's other senses, same part of speech, in order. */
  otherSenses: string[];
  /** What the checks found in the record's current content (read-only). */
  problems?: string[];
  /** Learners' open reports on this word, from `next --reported` (read-only). */
  reports?: ReportNote[];
  /** The word's pronunciation, shown with reports (read-only; change it with `ipa`). */
  ipa?: string | null;
  // Filled in by the reviewer.
  review: {
    scores: Partial<Record<Criterion, number>> | null;
    verdict: Verdict | null;
    notes: string;
  };
  // Filled in by a second reviewer: a subagent that did not write the content.
  checker: {
    scores: Partial<Record<Criterion, number>> | null;
    notes: string;
  };
}

export interface Worksheet {
  rubricVersion: number;
  createdAt: string;
  /**
   * The newest review id in the record when the worksheet was made. Set by
   * `next --reported`; `resolve` counts a word as answered only when it has a
   * newer review. Review dates alone cannot tell a review from earlier the
   * same day.
   */
  lastReviewId?: number;
  instructions: string;
  words: WorksheetEntry[];
}

export const WORKSHEET_INSTRUCTIONS =
  'Edit the content fields of each word, then fill in review.scores (1 to 5 for every ' +
  'criterion), review.verdict and review.notes. Then have a subagent that did not write the ' +
  'content fill in checker.scores and checker.notes. The rubric and the steps are in ' +
  '.claude/skills/improve-words/SKILL.md. Check with `npx tsx src/curate.ts check <file>`, ' +
  'then apply with `npx tsx src/curate.ts apply <file>`.';

export const PARTS_OF_SPEECH = ['noun', 'verb', 'adjective', 'adverb'];

const key = (s: string): string => s.trim().toLowerCase();

// For comparing sentences: case and punctuation are ignored, so two texts that
// differ only by a comma count as the same text.
export const textKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Share of content words (3 letters or more) two texts have in common, from 0
 * to 1. Used to catch a wrong answer that nearly repeats another word's option
 * for the same look-alike.
 */
export function overlap(a: string, b: string): number {
  const words = (s: string) => new Set(textKey(s).split(' ').filter((w) => w.length > 2));
  const x = words(a);
  const y = words(b);
  const shared = [...x].filter((w) => y.has(w)).length;
  const all = x.size + y.size - shared;
  return all === 0 ? 0 : shared / all;
}

/** At this overlap or more, two options for the same look-alike read as one. */
export const NEAR_REPEAT = 0.5;
const article = (noun: string): string => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
const letters = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '');
export const isSentence = (s: string): boolean => /^[A-Z"']/.test(s.trim()) && /[.!?]["']?$/.test(s.trim());
export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Characters that never belong in word content: code and markup symbols,
 * invisible characters and loose accent marks. A generation pass once left
 * "}]}```[instruction]@@" and a byte-order mark at the end of a hook.
 */
const JUNK = /[`{}<>[\]\\|]|@@|[\u200b-\u200f\u2028\u2029\ufeff\ufffd]|[\u0300-\u036f]/;

/** Whether text holds code or markup symbols, brackets, braces or invisible characters. */
export const hasJunk = (text: string): boolean => JUNK.test(text);

/** The house style bans em dashes (CLAUDE.md). */
export const EM_DASH = '\u2014';

/** An example tacked onto a definition: "..., like a dog that bites", "such as a coupon". */
const ILLUSTRATION = /,\s*(like|such as|as when|the way)\s|\bsuch as\s/i;

/** Every piece of text in an entry that the app can show. */
function contentTexts(entry: WorksheetEntry): string[] {
  return [
    entry.definition,
    entry.plain,
    entry.hook,
    ...entry.otherSenses,
    ...entry.examples.flatMap((ex) => [ex.text, ex.cloze]),
    ...entry.wrongAnswers.flatMap((wa) => [wa.lookalike, wa.meaning]),
    ...entry.synonyms,
    ...entry.antonyms,
  ];
}

/**
 * Whether text uses the word or a word built on it: an inflection
 * ("abated"), or any word that starts with it ("aesthetically",
 * "abatement"). A definition that does this gives the answer away.
 */
export function namesWord(text: string, word: string): boolean {
  if (findWordToken(text, word)) return true;
  const stem = word.toLowerCase().replace(/e$/, '');
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).some(
    (t) => t.length > word.length && t.startsWith(stem),
  );
}

export interface CheckEnv {
  lexicon: Lexicon;
  /** Wrong answers (lowercased) already used by words outside this worksheet, to their word id. */
  takenWrongAnswers: Map<string, number>;
  /** Other words' options, by look-alike, to catch near repeats. */
  lookalikeOptions?: Map<string, { meaning: string; wordId: number }[]>;
}

/** Content problems: anything that would be wrong to ship. */
export function checkContent(entry: WorksheetEntry, env: CheckEnv): string[] {
  const p: string[] = [];
  const word = entry.headword;
  const mentions = (text: string): boolean => namesWord(text, word);

  const content = { ...entry, problems: undefined, review: undefined, checker: undefined };
  if (JSON.stringify(content).includes('\u2014')) p.push('contains an em dash');
  for (const text of contentTexts(entry)) {
    if (JUNK.test(text)) p.push(`"${text.slice(0, 40)}" contains markup, code symbols or invisible characters`);
  }
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
  if (textKey(entry.plain) === textKey(entry.definition)) p.push('plain is the same as definition');

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
    if (texts.has(textKey(ex.text))) p.push(`${where} is repeated`);
    texts.add(textKey(ex.text));
  }

  // Wrong answers: real meanings of real look-alike words, same part of speech.
  if (entry.wrongAnswers.length < 4 || entry.wrongAnswers.length > 6) p.push('need 4 to 6 wrong answers');
  const lookalikes = new Set<string>();
  const meanings = new Set<string>();
  const correct = new Set([textKey(entry.definition), textKey(entry.plain)]);
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
    // An option that names its own look-alike ("...as with profuse apologies")
    // shows the learner it defines another word.
    if (lk && findWordToken(m, lk)) p.push(`wrong answer "${m.slice(0, 40)}" names its lookalike "${wa.lookalike}"`);
    // The options sit beside the definition, so a leading "To" on some and not
    // the others marks out the correct one.
    if (/^to\s/i.test(m) !== /^to\s/i.test(entry.definition.trim())) {
      p.push(`wrong answer "${m.slice(0, 40)}" must start the way the definition does (with or without "To")`);
    }
    // A wrong answer that carries an illustration ("..., like a dog that
    // bites") next to a plain definition lets the learner pick the plain one.
    if (ILLUSTRATION.test(m) && !ILLUSTRATION.test(entry.definition)) {
      p.push(`wrong answer "${m.slice(0, 40)}" has an example ("like ...", "such as ...") that the definition does not; keep it plain`);
    }
    if (correct.has(textKey(m))) p.push(`wrong answer "${m.slice(0, 40)}" is the correct definition`);
    if (meanings.has(textKey(m))) p.push(`wrong answer "${m.slice(0, 40)}" is repeated`);
    meanings.add(textKey(m));
    const owner = env.takenWrongAnswers.get(textKey(m));
    if (owner !== undefined && owner !== entry.wordId) p.push(`wrong answer "${m.slice(0, 40)}" is already used by word ${owner}`);
    // A learner who meets the same look-alike under two words should not see
    // the same sentence twice with a word or two changed.
    for (const other of env.lookalikeOptions?.get(key(wa.lookalike ?? '')) ?? []) {
      if (other.wordId !== entry.wordId && owner !== other.wordId && overlap(m, other.meaning) >= NEAR_REPEAT) {
        p.push(`wrong answer "${m.slice(0, 40)}" nearly repeats word ${other.wordId}'s option for ${wa.lookalike}`);
        break;
      }
    }
  }

  p.push(...checkHook(entry.hook, word));

  // Other senses: not shown on most screens, but their definitions become
  // fallback wrong answers for other words, so they must be clean too.
  if (entry.otherSenses.length > 3) p.push('at most 3 other senses');
  const senseTexts = new Set([textKey(entry.definition)]);
  for (const other of entry.otherSenses) {
    const where = `other sense "${other.slice(0, 40)}"`;
    if (!isSentence(other) || other.length < 10 || other.length > 220) {
      p.push(`${where} must be one sentence of 10 to 220 characters, capitalized, ending in a period`);
    }
    if (mentions(other)) p.push(`${where} names the word`);
    if (senseTexts.has(textKey(other))) p.push(`${where} repeats another sense`);
    senseTexts.add(textKey(other));
  }

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

/**
 * What is wrong with a memory hook. Extras worksheets run the same checks on a
 * hook they correct.
 */
export function checkHook(text: string, word: string): string[] {
  const p: string[] = [];
  const hook = text.trim();
  if (hook.length < 20 || hook.length > 240) p.push('hook must be 20 to 240 characters');
  if (!letters(hook).includes(letters(word))) p.push('hook must name the word');
  return p;
}

function scoreProblems(
  label: string,
  scores: Partial<Record<string, number>> | null,
  criteria: readonly string[],
): string[] {
  if (!scores) return [`${label}.scores is not filled in`];
  const p: string[] = [];
  for (const c of criteria) {
    const s = scores[c];
    if (s === undefined || s === null) p.push(`${label}.scores.${c} is missing`);
    else if (!Number.isInteger(s) || s < 1 || s > 5) p.push(`${label}.scores.${c} must be a whole number from 1 to 5`);
  }
  return p;
}

/** The writer's review and the second reviewer's scores, on any rubric. */
export interface ReviewBlocks {
  review: { scores: Partial<Record<string, number>> | null; verdict: Verdict | null; notes: string };
  checker: { scores: Partial<Record<string, number>> | null; notes: string };
}

/**
 * Review problems on any rubric: the writer's and the second reviewer's scores
 * must be filled in for every criterion, and the verdict must agree with both
 * and with the changes.
 */
export function checkVerdict(entry: ReviewBlocks, criteria: readonly string[], changed: string[]): string[] {
  const { scores, verdict, notes } = entry.review;
  const checkerScores = entry.checker?.scores ?? null;
  const p = [...scoreProblems('review', scores, criteria), ...scoreProblems('checker', checkerScores, criteria)];
  if (p.length > 0 || !scores || !checkerScores) return p;
  if (verdict !== 'pass' && verdict !== 'fixed' && verdict !== 'flagged') {
    p.push('review.verdict must be "pass", "fixed" or "flagged"');
    return p;
  }
  const low = criteria.filter((c) => (scores[c] ?? 0) < PASS_SCORE);
  if (verdict !== 'flagged' && low.length > 0) {
    p.push(`verdict "${verdict}" needs every score at ${PASS_SCORE} or more; low: ${low.join(', ')}. Fix them or flag the word.`);
  }
  const checkerLow = criteria.filter((c) => (checkerScores[c] ?? 0) < PASS_SCORE);
  if (verdict !== 'flagged' && checkerLow.length > 0) {
    p.push(
      `the second reviewer scored ${checkerLow.join(', ')} under ${PASS_SCORE} ` +
        `(${entry.checker.notes || 'no notes'}). Fix the content and ask again, or flag the word.`,
    );
  }
  if (verdict === 'flagged' && notes.trim().length < 15) p.push('a flagged word needs notes saying what is still wrong');
  if (verdict === 'pass' && changed.length > 0) p.push(`verdict "pass" but these fields changed: ${changed.join(', ')}; use "fixed"`);
  if (verdict === 'fixed' && changed.length === 0) p.push('verdict "fixed" but nothing changed; use "pass"');
  return p;
}

/**
 * Review problems on the main rubric: the writer's and the second reviewer's
 * scores must be filled in, and the verdict must agree with both and with the
 * changes.
 */
export function checkReview(entry: WorksheetEntry, changed: string[]): string[] {
  return checkVerdict(entry, CRITERIA, changed);
}

// --- reviews in the record ------------------------------------------------------

/**
 * Reviews on the main rubric. Extras reviews (lib/extras.ts) score other
 * fields on their own rubric, so they never stand for a main review: a word
 * with only an extras review is still unreviewed here.
 */
export function mainReviews(reviews: ReviewRow[]): ReviewRow[] {
  return reviews.filter((r) => (r.rubric ?? 'main') === 'main');
}

/** The newest main review per word at the current rubric version. */
export function currentReviews(reviews: ReviewRow[]): Map<number, ReviewRow> {
  const out = new Map<number, ReviewRow>();
  for (const r of mainReviews(reviews)) {
    if (r.rubric_version === RUBRIC_VERSION) out.set(r.word_id, r);
  }
  return out;
}

/** Which content fields differ between the record's entry and the edited one. */
export function changedFields(before: WorksheetEntry, after: WorksheetEntry): string[] {
  const fields: (keyof WorksheetEntry)[] = [
    'partOfSpeech',
    'otherSenses',
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
    checker: { scores: null, notes: '' },
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
      if (d.sense_id === primary.id) owners.set(textKey(d.distractor_lemma), word.id);
    }
  }
  return owners;
}

/** Each look-alike's options in the record, for words outside `skipWordIds`. */
export function lookalikeOptions(
  rows: ContentRows,
  skipWordIds: Set<number>,
): Map<string, { meaning: string; wordId: number }[]> {
  const options = new Map<string, { meaning: string; wordId: number }[]>();
  for (const word of rows.words) {
    if (skipWordIds.has(word.id)) continue;
    const primary = primarySense(rows, word.id);
    if (!primary) continue;
    for (const d of rows.distractors) {
      if (d.sense_id !== primary.id || !d.lookalike) continue;
      const list = options.get(key(d.lookalike)) ?? [];
      list.push({ meaning: d.distractor_lemma, wordId: word.id });
      options.set(key(d.lookalike), list);
    }
  }
  return options;
}

/**
 * Pairs of options for the same look-alike, under two different words, that
 * nearly repeat each other. `check` rejects these one word at a time; this
 * lists every pair left in the record, for `status`.
 */
export function nearRepeats(
  options: Map<string, { meaning: string; wordId: number }[]>,
): { lookalike: string; wordIds: [number, number] }[] {
  const pairs: { lookalike: string; wordIds: [number, number] }[] = [];
  for (const [lookalike, list] of options) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].wordId !== list[j].wordId && overlap(list[i].meaning, list[j].meaning) >= NEAR_REPEAT) {
          pairs.push({ lookalike, wordIds: [list[i].wordId, list[j].wordId] });
        }
      }
    }
  }
  return pairs;
}

/**
 * Split items into `parts` runs of near-equal size, in order, for a big
 * curation run that gives each worksheet to its own subagent.
 */
export function splitIntoParts<T>(items: T[], parts: number): T[][] {
  const n = Math.max(1, Math.min(parts, items.length));
  const out: T[][] = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    const size = Math.floor(items.length / n) + (i < items.length % n ? 1 : 0);
    out.push(items.slice(start, start + size));
    start += size;
  }
  return out;
}

/** Short problem labels with the quoted text removed, for counting. */
export function problemKind(problem: string): string {
  return problem.replace(/"[^"]*"/g, '…').replace(/\(has \d+\)/, '').replace(/\d+/g, 'N').trim();
}

// --- pronunciation ------------------------------------------------------------
//
// The app shows `ipa` under the headword. Every word uses one style: broad
// General American, as in American learner's dictionaries. That means "r" (not
// "ɹ"), "ɝ" and "ɚ" for stressed and unstressed r-colored vowels, "oʊ", no
// syllable dots, tie bars, length marks or aspiration. WordNet's pronunciations
// mixed US and UK forms and narrow symbols, and some were for another part of
// speech (adulterate the adjective, not the verb), so they were all rewritten
// on 2026-10-11.

const IPA_VOWEL = /eɪ|aɪ|aʊ|ɔɪ|oʊ|[iɪɛæɑɔʊuʌəɚɝ]/g;
const IPA_ALLOWED = /^[pbtdkɡfvθðszʃʒhmnŋlrjwiɪɛæɑɔʊuʌəɚɝeaoˈˌ]+$/;

/** Syllables in a pronunciation, counted by vowel. */
export function ipaSyllables(ipa: string): number {
  return (ipa.match(IPA_VOWEL) ?? []).length;
}

/** What is wrong with a pronunciation, or an empty list. */
export function checkIpa(ipa: string): string[] {
  const problems: string[] = [];
  const m = /^\/(.+)\/$/.exec(ipa);
  if (!m) return [`pronunciation "${ipa}" must be wrapped in slashes`];
  const body = m[1]!;
  const bad = [...new Set(body.replace(/tʃ|dʒ/g, '').split('').filter((c) => !IPA_ALLOWED.test(c)))];
  if (bad.length > 0) problems.push(`pronunciation "${ipa}" uses symbols outside the house style: ${bad.join(' ')}`);
  if (/[eao](?![ɪʊ])/.test(body.replace(/ɔɪ/g, ''))) {
    problems.push(`pronunciation "${ipa}" has a bare e, a or o (use eɪ, aɪ, aʊ, oʊ)`);
  }
  const primary = (body.match(/ˈ/g) ?? []).length;
  const syllables = ipaSyllables(body);
  if (syllables === 0) problems.push(`pronunciation "${ipa}" has no vowel`);
  if (syllables > 1 && primary !== 1) problems.push(`pronunciation "${ipa}" needs exactly one primary stress mark`);
  if (syllables === 1 && /[ˈˌ]/.test(body)) problems.push(`pronunciation "${ipa}" has one syllable and needs no stress mark`);
  return problems;
}

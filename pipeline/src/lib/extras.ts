// Extras: content beyond the main entry that helps a learner remember and use
// a word. Where the word comes from (an "Origin" line, and the roots that link
// it to other words in the list), its tone, a "Watch out" note for a common
// misreading, common pairings, and other meanings worth showing under "Also
// means".
//
// Extras are written and reviewed on their own worksheets, with their own
// rubric, so this work never reopens a word's main review (lib/curate.ts). An
// extras review is stored as a ReviewRow with rubric 'extras'; main readers
// ignore it and extras readers ignore main reviews. The process is in
// .claude/skills/improve-words/SKILL.md under "Extras".

import {
  buildEntry,
  checkHook,
  checkVerdict,
  CURATED_REVISION,
  EM_DASH,
  hasJunk,
  isSentence,
  namesWord,
  primarySense,
  textKey,
  wordCount,
  type Verdict,
} from './curate.ts';
import type { ContentRows } from './exportContent.ts';
import type { Store } from './store.ts';
import type { ReviewRow, SenseRow, WordRow } from './types.ts';
import { findWordToken } from './wordnet.ts';

/** Bump when the extras rubric changes in a way that makes old extras reviews stale. */
export const EXTRAS_RUBRIC_VERSION = 1;

export const EXTRAS_CRITERIA = ['origin', 'hook', 'tone', 'watchOut', 'pairings', 'alsoMeans'] as const;
export type ExtrasCriterion = (typeof EXTRAS_CRITERIA)[number];

/** Tone labels a sense may carry. Null means the word is neutral. */
export const REGISTERS = [
  'formal',
  'informal',
  'literary',
  'disapproving',
  'approving',
  'humorous',
  'old-fashioned',
  'technical',
] as const;
export type Register = (typeof REGISTERS)[number];

export const ORIGIN_MAX_CHARS = 220;
export const WATCH_OUT_MAX_CHARS = 160;
export const MAX_ROOTS = 3;
export const MIN_PAIRINGS = 2;
export const MAX_PAIRINGS = 4;
export const MAX_ALSO_MEANS = 2;
export const ALSO_MEANS_MAX_WORDS = 20;

/**
 * Bare prefixes and suffixes. A root links words that share a stem; linking
 * on "pro" or "-ous" would join words that have nothing in common.
 */
export const AFFIX_STOPLIST: ReadonlySet<string> = new Set([
  // Latin and English prefixes.
  'abs', 'ante', 'anti', 'bene', 'circum', 'com', 'con', 'contra', 'counter', 'dis', 'extra',
  'inter', 'intra', 'intro', 'mal', 'male', 'mis', 'multi', 'non', 'omni', 'per', 'post', 'pre',
  'pro', 'retro', 'semi', 'sub', 'super', 'supra', 'trans', 'ultra', 'uni', 'under', 'over', 'out',
  // Greek prefixes.
  'amphi', 'ana', 'apo', 'auto', 'cata', 'dia', 'dys', 'epi', 'hyper', 'hypo', 'meta', 'pan',
  'para', 'peri', 'poly', 'pseudo', 'syn', 'sym', 'tele',
  // Suffixes.
  'able', 'ible', 'ate', 'ive', 'ity', 'ism', 'ist', 'ize', 'ise', 'ment', 'ness', 'tion', 'sion',
  'ous', 'ious', 'ance', 'ence', 'ancy', 'ency', 'ful', 'less', 'logy', 'ology', 'ary', 'ory',
  'ant', 'ent', 'ure', 'ify', 'ian', 'ine', 'ile', 'ial', 'ical', 'osus', 'alis', 'ilis', 'ere',
]);

export interface ExtrasOtherSense {
  senseId: number;
  /**
   * Read-only. Other words use this text as a fallback wrong answer, so it is
   * changed only on a main worksheet.
   */
  definition: string;
  /** Plain definition in everyday words. Required when alsoMeans is true. */
  plain: string;
  register: string | null;
  /** Show this sense under "Also means". */
  alsoMeans: boolean;
}

export interface ExtrasEntry {
  // Read-only context, from the record's main entry.
  wordId: number;
  headword: string;
  tier: number;
  partOfSpeech: string;
  ipa: string | null;
  definition: string;
  plain: string;
  examples: string[];
  synonyms: string[];
  antonyms: string[];
  // Editable.
  /** Where the word comes from, in one or two sentences. Starts empty. */
  origin: string;
  /** Root forms named in `origin` that link the word to others sharing them. */
  roots: string[];
  /** Tone of the first sense, or null. */
  register: string | null;
  /** A "Watch out" note on a common misreading or misuse, or null. */
  watchOut: string | null;
  /** 2 to 4 common collocations of the first sense, or none. */
  pairings: string[];
  /** The memory hook. Change it only to correct a false origin claim. */
  hook: string;
  otherSenses: ExtrasOtherSense[];
  // Filled in by the writer.
  review: {
    scores: Partial<Record<ExtrasCriterion, number>> | null;
    verdict: Verdict | null;
    notes: string;
  };
  // Filled in by a second reviewer that did not write the content.
  checker: {
    scores: Partial<Record<ExtrasCriterion, number>> | null;
    notes: string;
  };
}

export interface ExtrasWorksheet {
  /** Tells the two worksheet kinds apart; main commands refuse this one. */
  kind: 'extras';
  rubricVersion: number;
  createdAt: string;
  instructions: string;
  words: ExtrasEntry[];
}

export const EXTRAS_INSTRUCTIONS =
  'For each word, write origin, roots, register (the tone of the first sense), watchOut and ' +
  "pairings, and for each other sense its plain, register and alsoMeans. Change hook only to " +
  'correct a false origin claim. Then fill in review.scores (1 to 5 for every criterion), ' +
  'review.verdict and review.notes, and have a subagent that did not write the content fill in ' +
  'checker.scores and checker.notes. The rubric and the steps are under "Extras" in ' +
  '.claude/skills/improve-words/SKILL.md. Check with `npx tsx src/curate.ts extras check <file>`, ' +
  'then apply with `npx tsx src/curate.ts extras apply <file>`.';

/** Context fields the worksheet shows but never writes. */
const READ_ONLY = ['partOfSpeech', 'definition', 'plain', 'examples', 'synonyms', 'antonyms'] as const;

// --- reading the record ---------------------------------------------------------

const bySenseOrder = (a: SenseRow, b: SenseRow): number => a.sense_order - b.sense_order || a.id - b.id;

/** The record's current extras for one word, with its main entry as context. */
export function buildExtrasEntry(rows: ContentRows, word: WordRow): ExtrasEntry {
  const main = buildEntry(rows, word);
  const primary = primarySense(rows, word.id)!; // buildEntry throws when there is none
  const others = rows.senses.filter((s) => s.word_id === word.id && s.id !== primary.id).sort(bySenseOrder);
  return {
    wordId: word.id,
    headword: word.headword,
    tier: word.difficulty_tier,
    partOfSpeech: main.partOfSpeech,
    ipa: word.ipa,
    definition: main.definition,
    plain: main.plain,
    examples: main.examples.map((e) => e.text),
    synonyms: main.synonyms,
    antonyms: main.antonyms,
    origin: word.etymology ?? '',
    roots: word.roots ?? [],
    register: primary.register,
    watchOut: word.watch_out ?? null,
    pairings: word.pairings ?? [],
    hook: main.hook,
    otherSenses: others.map((s) => ({
      senseId: s.id,
      definition: s.definition,
      plain: s.plain_language_definition ?? '',
      register: s.register,
      alsoMeans: s.also_means ?? false,
    })),
    review: { scores: null, verdict: null, notes: '' },
    checker: { scores: null, notes: '' },
  };
}

/** Extras reviews only. Main reviews (lib/curate.ts) never count here. */
export function extrasReviewsOf(reviews: ReviewRow[]): ReviewRow[] {
  return reviews.filter((r) => r.rubric === 'extras');
}

/** The newest extras review per word at the current extras rubric version. */
export function currentExtrasReviews(reviews: ReviewRow[]): Map<number, ReviewRow> {
  const out = new Map<number, ReviewRow>();
  for (const r of extrasReviewsOf(reviews)) {
    if (r.rubric_version === EXTRAS_RUBRIC_VERSION) out.set(r.word_id, r);
  }
  return out;
}

/**
 * Words with no extras review yet at the current extras rubric, in record
 * order. `rows` should hold only the words still taught.
 */
export function extrasCandidates(rows: ContentRows, reviews: ReviewRow[]): WordRow[] {
  const done = currentExtrasReviews(reviews);
  return rows.words.filter((w) => !done.has(w.id) && primarySense(rows, w.id));
}

// --- checks ------------------------------------------------------------------------

/**
 * Text folded for comparing a root with the origin: lowercase, no diacritics,
 * so "prōlēs" in an origin matches the root "proles".
 */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/æ/gi, 'ae')
    .replace(/œ/gi, 'oe')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

const URL = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|net|edu|io)\b/i;
const CAPITALIZED = /^["'“]?[A-Z]/;
const ENDS_WITH_PERIOD = /\.["'”’]?$/;
/** A sentence end: end punctuation followed by a capitalized word, or the end of the text. */
const SENTENCE_END = /[.!?]["'”’)]?(?=\s+["'“(]?[A-Z]|\s*$)/g;

/** Number of sentences, counted by their end punctuation. */
export function sentenceCount(text: string): number {
  return (text.trim().match(SENTENCE_END) ?? []).length;
}

const short = (s: string): string => s.slice(0, 40);

/** House-style problems in a piece of editable text. */
function styleProblems(label: string, text: string): string[] {
  const p: string[] = [];
  if (text.includes(EM_DASH)) p.push(`${label} contains an em dash`);
  if (hasJunk(text)) p.push(`${label} contains brackets, braces, markup, code symbols or invisible characters`);
  if (URL.test(text)) p.push(`${label} contains a URL`);
  return p;
}

export function checkOrigin(origin: string): string[] {
  const text = origin.trim();
  if (!text) return ['origin is empty; say where the word comes from ("Of unknown origin." when nobody knows)'];
  const p: string[] = [];
  if (text.length > ORIGIN_MAX_CHARS) p.push(`origin must be at most ${ORIGIN_MAX_CHARS} characters (has ${text.length})`);
  if (!CAPITALIZED.test(text) || !ENDS_WITH_PERIOD.test(text)) {
    p.push('origin must start with a capital letter and end with a period');
  }
  const sentences = sentenceCount(text);
  if (sentences > 2) p.push(`origin must be one or two sentences (has ${sentences})`);
  p.push(...styleProblems('origin', text));
  return p;
}

export function checkRoots(roots: string[], origin: string): string[] {
  const p: string[] = [];
  if (roots.length > MAX_ROOTS) p.push(`at most ${MAX_ROOTS} roots`);
  const named = new Set(foldText(origin).match(/[a-z]+/g) ?? []);
  const seen = new Set<string>();
  for (const root of roots) {
    if (!/^[a-z]+$/.test(root)) {
      p.push(`root "${root}" must be lowercase ASCII letters only (no diacritics, hyphens or spaces)`);
      continue;
    }
    if (seen.has(root)) p.push(`root "${root}" is listed twice`);
    else if (root.length < 3) p.push(`root "${root}" is too short; use the stem, 3 letters or more`);
    else if (AFFIX_STOPLIST.has(root)) p.push(`root "${root}" is a bare prefix or suffix; use the stem it attaches to`);
    else if (!named.has(root)) p.push(`root "${root}" does not appear in origin; name that form there so the link is explained`);
    seen.add(root);
  }
  return p;
}

export function checkRegister(label: string, register: string | null): string[] {
  if (register === null || (REGISTERS as readonly string[]).includes(register)) return [];
  return [`${label} "${register}" must be null or one of ${REGISTERS.join(', ')}`];
}

export function checkWatchOut(watchOut: string | null): string[] {
  if (watchOut === null) return [];
  const text = watchOut.trim();
  if (!text) return ['watchOut is empty; use null for no note'];
  const p: string[] = [];
  if (text.length > WATCH_OUT_MAX_CHARS) {
    p.push(`watchOut must be at most ${WATCH_OUT_MAX_CHARS} characters (has ${text.length})`);
  }
  if (!CAPITALIZED.test(text) || !ENDS_WITH_PERIOD.test(text)) {
    p.push('watchOut must start with a capital letter and end with a period');
  }
  p.push(...styleProblems('watchOut', text));
  return p;
}

const PAIRING_WORD = /^[A-Za-z]+(?:['-][A-Za-z]+)*$/;

export function checkPairings(pairings: string[], word: string): string[] {
  const p: string[] = [];
  if (pairings.length > 0 && (pairings.length < MIN_PAIRINGS || pairings.length > MAX_PAIRINGS)) {
    p.push(`need ${MIN_PAIRINGS} to ${MAX_PAIRINGS} pairings, or none`);
  }
  const seen = new Set<string>();
  for (const pairing of pairings) {
    const where = `pairing "${short(pairing)}"`;
    const words = pairing.trim().split(/\s+/).filter(Boolean);
    if (pairing !== pairing.trim() || /\s{2,}/.test(pairing)) p.push(`${where} has extra spaces`);
    if (!words.every((w) => PAIRING_WORD.test(w))) {
      p.push(`${where} must be words only (letters, hyphens, apostrophes), with no punctuation`);
      continue;
    }
    if (words.length < 2 || words.length > 4) p.push(`${where} must be 2 to 4 words (has ${words.length})`);
    const token = findWordToken(pairing, word);
    if (!token) p.push(`${where} does not use the word or a form of it`);
    // Lowercase, as the pairing would appear mid-sentence. Only a proper noun
    // after the first word may be capitalized ("a Senate filibuster").
    const badCase = words.some((w, i) =>
      w === w.toLowerCase() ? false : i === 0 || w === token || !/^[A-Z][a-z'-]+$/.test(w),
    );
    if (badCase) p.push(`${where} must be lowercase; capitalize only a proper noun, and not as the first word`);
    if (seen.has(textKey(pairing))) p.push(`${where} is listed twice`);
    seen.add(textKey(pairing));
  }
  return p;
}

/** Checks on a plain definition shown under "Also means", or rewritten. */
function checkOtherPlain(plain: string, entry: ExtrasEntry, where: string): string[] {
  const p: string[] = [];
  if (!isSentence(plain) || !ENDS_WITH_PERIOD.test(plain)) {
    p.push(`${where}: plain must be one capitalized sentence ending with a period`);
  }
  const n = wordCount(plain);
  if (n > ALSO_MEANS_MAX_WORDS) p.push(`${where}: plain must be at most ${ALSO_MEANS_MAX_WORDS} words (has ${n})`);
  if (namesWord(plain, entry.headword)) p.push(`${where}: plain names the word`);
  if (textKey(plain) === textKey(entry.plain) || textKey(plain) === textKey(entry.definition)) {
    p.push(`${where}: plain repeats the first sense`);
  }
  p.push(...styleProblems(`${where}: plain`, plain));
  return p;
}

function checkOtherSenses(entry: ExtrasEntry, before: ExtrasEntry): string[] {
  const p: string[] = [];
  const sameSenses =
    entry.otherSenses.length === before.otherSenses.length &&
    entry.otherSenses.every((s, i) => s.senseId === before.otherSenses[i]!.senseId);
  if (!sameSenses) {
    return [
      'otherSenses must list the same senses as the record, in the same order ' +
        '(the record changed since the worksheet was made, or a sense was added or removed); make a new worksheet',
    ];
  }
  let shown = 0;
  entry.otherSenses.forEach((sense, i) => {
    const old = before.otherSenses[i]!;
    const where = `other sense "${short(old.definition)}"`;
    if (sense.definition !== old.definition) {
      p.push(`${where}: definition is read-only here (other words use it as a wrong answer); change it on a main worksheet`);
    }
    p.push(...checkRegister(`${where}: register`, sense.register));
    const plain = sense.plain.trim();
    if (sense.alsoMeans) {
      shown += 1;
      if (!plain) p.push(`${where} is shown under Also means, so it needs a plain definition`);
    }
    if (plain && (sense.alsoMeans || plain !== old.plain.trim())) p.push(...checkOtherPlain(plain, entry, where));
  });
  if (shown > MAX_ALSO_MEANS) p.push(`at most ${MAX_ALSO_MEANS} other senses may be shown under Also means (has ${shown})`);
  return p;
}

/** Hand-edited JSON can hold the wrong types; say so before the other checks run. */
export function extrasShapeProblems(entry: ExtrasEntry): string[] {
  const p: string[] = [];
  const isStringList = (v: unknown): boolean => Array.isArray(v) && v.every((x) => typeof x === 'string');
  const isNullableString = (v: unknown): boolean => v === null || typeof v === 'string';
  if (typeof entry.origin !== 'string') p.push('origin must be a string');
  if (!isStringList(entry.roots)) p.push('roots must be a list of strings');
  if (!isNullableString(entry.register)) p.push('register must be a string or null');
  if (!isNullableString(entry.watchOut)) p.push('watchOut must be a string or null');
  if (!isStringList(entry.pairings)) p.push('pairings must be a list of strings');
  if (typeof entry.hook !== 'string') p.push('hook must be a string');
  if (!Array.isArray(entry.otherSenses)) p.push('otherSenses must be a list');
  else {
    entry.otherSenses.forEach((s, i) => {
      const ok =
        typeof s === 'object' &&
        s !== null &&
        typeof s.senseId === 'number' &&
        typeof s.definition === 'string' &&
        typeof s.plain === 'string' &&
        isNullableString(s.register) &&
        typeof s.alsoMeans === 'boolean';
      if (!ok) p.push(`otherSenses[${i}] must have senseId, definition, plain (a string), register (a string or null) and alsoMeans (true or false)`);
    });
  }
  if (typeof entry.review !== 'object' || entry.review === null) p.push('review block is missing');
  if (typeof entry.checker !== 'object' || entry.checker === null) p.push('checker block is missing');
  return p;
}

/**
 * Content problems in an extras entry, against `before`, the record's current
 * extras for the same word (buildExtrasEntry).
 */
export function checkExtras(entry: ExtrasEntry, before: ExtrasEntry): string[] {
  const shape = extrasShapeProblems(entry);
  if (shape.length > 0) return shape;
  const p: string[] = [];
  for (const field of READ_ONLY) {
    if (JSON.stringify(entry[field]) !== JSON.stringify(before[field])) {
      p.push(
        `${field} is read-only on an extras worksheet and differs from the record ` +
          '(edited, or the record changed since the worksheet was made); change it on a main worksheet',
      );
    }
  }
  p.push(...checkOrigin(entry.origin));
  p.push(...checkRoots(entry.roots, entry.origin));
  p.push(...checkRegister('register', entry.register));
  p.push(...checkWatchOut(entry.watchOut));
  p.push(...checkPairings(entry.pairings, entry.headword));
  p.push(...checkOtherSenses(entry, before));
  if (entry.hook.trim() !== before.hook.trim()) {
    p.push(...checkHook(entry.hook, entry.headword), ...styleProblems('hook', entry.hook));
  }
  return p;
}

/** Review problems on the extras rubric: same verdict rules as the main worksheet. */
export function checkExtrasReview(entry: ExtrasEntry, changed: string[]): string[] {
  return checkVerdict(entry, EXTRAS_CRITERIA, changed);
}

/** Which editable fields differ between the record's extras and the edited entry. */
export function extrasChangedFields(before: ExtrasEntry, after: ExtrasEntry): string[] {
  const norm = (e: ExtrasEntry): Record<string, unknown> => ({
    origin: e.origin.trim(),
    roots: e.roots,
    register: e.register,
    watchOut: e.watchOut === null ? null : e.watchOut.trim(),
    pairings: e.pairings.map((x) => x.trim()),
    hook: e.hook.trim(),
    otherSenses: e.otherSenses.map((s) => [s.senseId, s.plain.trim(), s.register, s.alsoMeans]),
  });
  const a = norm(before);
  const b = norm(after);
  return Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

// --- writing the record -------------------------------------------------------------

/**
 * Write one checked entry into the record: the word's origin, roots, watch-out
 * note and pairings, the tone of every sense, the other senses' plain
 * definitions and Also means flags, a corrected hook, and the review. Call it
 * only after checkExtras and checkExtrasReview pass, then flush the store and
 * remake audio and the words file, as `extras apply` does.
 */
export async function applyExtrasEntry(
  store: Store,
  rows: ContentRows,
  entry: ExtrasEntry,
  changed: string[],
  reviewedAt: string,
): Promise<ReviewRow> {
  const word = rows.words.find((w) => w.id === entry.wordId);
  const primary = word ? primarySense(rows, word.id) : undefined;
  if (!word || !primary) throw new Error(`applyExtrasEntry: no word ${entry.wordId} with a sense in the record`);
  await store.updateWordMeta(word.id, {
    etymology: entry.origin.trim(),
    roots: [...entry.roots],
    watch_out: entry.watchOut === null ? null : entry.watchOut.trim(),
    pairings: entry.pairings.map((x) => x.trim()),
  });
  await store.updateSense(primary.id, { register: entry.register });
  for (const sense of entry.otherSenses) {
    const plain = sense.plain.trim();
    await store.updateSense(sense.senseId, {
      plain_language_definition: plain || null,
      register: sense.register,
      also_means: sense.alsoMeans,
    });
  }
  if (changed.includes('hook')) {
    // The same write the main apply makes for a changed hook. Stage 04 then
    // remakes any clip made from the old text.
    await store.replaceGlobalMnemonic(word.id, {
      word_id: word.id,
      text: entry.hook.trim(),
      source: 'claude',
      user_id: null,
      revision: CURATED_REVISION,
    });
  }
  const scores = (block: { scores: Partial<Record<ExtrasCriterion, number>> | null }): Record<string, number> =>
    Object.fromEntries(EXTRAS_CRITERIA.map((c) => [c, block.scores?.[c] ?? 0]));
  return store.addReview({
    word_id: word.id,
    rubric: 'extras',
    rubric_version: EXTRAS_RUBRIC_VERSION,
    reviewed_at: reviewedAt,
    scores: scores(entry.review),
    verdict: entry.review.verdict!,
    changed,
    notes: entry.review.notes.trim(),
    checker_scores: scores(entry.checker),
    checker_notes: entry.checker.notes.trim(),
  });
}

// --- status ------------------------------------------------------------------------

export interface ExtrasSummary {
  words: number;
  reviewed: number;
  verdicts: Record<Verdict, number>;
  flagged: { headword: string; notes: string }[];
  withOrigin: number;
  withRoots: number;
  /** Senses (first or other) with each tone label. */
  registers: Record<string, number>;
  withWatchOut: number;
  withPairings: number;
  alsoMeansSenses: number;
  /** Roots that two or more words share, which is what links them. */
  sharedRoots: { root: string; headwords: string[] }[];
  /** Roots only one word has so far. */
  loneRoots: number;
}

/** Counts for `extras status`. `rows` should hold only the words still taught. */
export function summarizeExtras(rows: ContentRows, reviews: ReviewRow[]): ExtrasSummary {
  const active = new Set(rows.words.map((w) => w.id));
  const done = [...currentExtrasReviews(reviews).values()].filter((r) => active.has(r.word_id));
  const verdicts: Record<Verdict, number> = { pass: 0, fixed: 0, flagged: 0 };
  for (const r of done) verdicts[r.verdict] += 1;
  const headword = (id: number): string => rows.words.find((w) => w.id === id)?.headword ?? `word ${id}`;
  const registers: Record<string, number> = {};
  let alsoMeansSenses = 0;
  for (const s of rows.senses) {
    if (!active.has(s.word_id)) continue;
    if (s.register) registers[s.register] = (registers[s.register] ?? 0) + 1;
    if (s.also_means) alsoMeansSenses += 1;
  }
  const byRoot = new Map<string, string[]>();
  for (const w of rows.words) {
    for (const root of w.roots ?? []) byRoot.set(root, [...(byRoot.get(root) ?? []), w.headword]);
  }
  const shared = [...byRoot].filter(([, words]) => words.length > 1).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    words: rows.words.length,
    reviewed: done.length,
    verdicts,
    flagged: done.filter((r) => r.verdict === 'flagged').map((r) => ({ headword: headword(r.word_id), notes: r.notes })),
    withOrigin: rows.words.filter((w) => w.etymology?.trim()).length,
    withRoots: rows.words.filter((w) => (w.roots ?? []).length > 0).length,
    registers,
    withWatchOut: rows.words.filter((w) => w.watch_out?.trim()).length,
    withPairings: rows.words.filter((w) => (w.pairings ?? []).length > 0).length,
    alsoMeansSenses,
    sharedRoots: shared.map(([root, headwords]) => ({ root, headwords })),
    loneRoots: byRoot.size - shared.length,
  };
}

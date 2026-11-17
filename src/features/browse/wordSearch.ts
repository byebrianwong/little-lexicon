// The search on the "All words" view. Pure and unit tested.
//
// A search finds a word by its spelling, and also finds the words near what
// was typed. Results come in this order, best first:
//
// 1. The headword: the same word, then another form of it ("abated" finds
//    abate), then a headword that starts with the text, then one that
//    contains it.
// 2. Similar: a word that lists the text as a synonym ("lessen" finds abate).
//    When the text is a word in the collection, the words it lists as
//    synonyms come here too.
// 3. Opposite: the same for antonyms ("escalate" finds abate).
// 4. Same root: when the text is a word in the collection, the words that
//    share a root with it.
// 5. Shared synonyms and antonyms: when the text is a word in the
//    collection, the words that list one of the same synonyms ("abate"
//    finds alleviate, because both list "lessen"), then one of the same
//    antonyms.
// 6. Close spelling: a headword one or two letters off, for a typo
//    ("obsequios" finds obsequious). A typo rarely matches a synonym, so
//    these come after the synonyms, where a near miss on a correctly
//    spelled word does not push real matches down.
// 7. Meaning: a word whose definition uses the text ("calm" finds abate).
// 8. Starts of words, so results show up while the text is still being
//    typed: a synonym, then an antonym, then a definition word that starts
//    with the text ("dimin" finds abate, which lists diminish). Last, a
//    headword whose start is a letter off the text.
//
// Each word is listed once, under its best match. Ties go to the closer
// synonym or antonym (the content lists them closest first), then to the
// collection's order (easiest first).
//
// Short searches match less, so a list of hundreds does not fill up with
// weak matches: one letter matches headwords that start with it, two letters
// also match headwords that contain them, three also match synonyms,
// antonyms and definitions, and four or more also match close spellings.

import type { WordContent } from '@/lib/types';

/** Why a word is in the results. */
export type SearchMatch =
  /** Its headword matches the search. */
  | { kind: 'headword' }
  /** Its headword is a letter or two off the search. */
  | { kind: 'spelling' }
  /** It is listed as a synonym of `word`, or lists `word` as one. */
  | { kind: 'similar'; word: string }
  /** It is listed as an antonym of `word`, or lists `word` as one. */
  | { kind: 'opposite'; word: string }
  /** It shares a root with `word`. */
  | { kind: 'sameRoot'; word: string }
  /** Its definition uses `word`. */
  | { kind: 'meaning'; word: string };

export interface SearchHit {
  word: WordContent;
  match: SearchMatch;
}

const HEADWORD: SearchMatch = { kind: 'headword' };

/** Best first. Each match keeps the lowest tier it reaches. */
const TIER = {
  exact: 0,
  form: 1,
  prefix: 2,
  contains: 3,
  similar: 4,
  opposite: 5,
  sameRoot: 6,
  sharedSynonym: 7,
  sharedAntonym: 8,
  spelling: 9,
  meaning: 10,
  similarPrefix: 11,
  oppositePrefix: 12,
  meaningPrefix: 13,
  spellingStart: 14,
} as const;

/**
 * Words too common to search definitions for. Nearly every definition uses
 * one, so a search for "the" would list the whole collection as "Meaning".
 */
const STOP_WORDS = new Set([
  'and',
  'any',
  'are',
  'but',
  'for',
  'from',
  'has',
  'have',
  'into',
  'its',
  'not',
  'one',
  'some',
  'someone',
  'something',
  'than',
  'that',
  'the',
  'this',
  'was',
  'what',
  'when',
  'which',
  'who',
  'with',
]);

/**
 * Lowercase ASCII letters and digits, one space between words. Accents are
 * dropped, apostrophes removed and other punctuation (hyphens too) turned
 * into spaces, so "Naïve", "naive" and "yes-man" match "naive" and "yes man".
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Checked in order; the first that fits is the only one taken off. */
const SUFFIXES: readonly (readonly [string, string])[] = [
  ['iness', 'y'],
  ['ness', ''],
  ['ies', 'y'],
  ['ied', 'y'],
  ['ily', 'y'],
  ['ing', ''],
  ['ed', ''],
  ['ly', ''],
  ['es', ''],
  ['s', ''],
];

/**
 * A rough stem for one normalized word, so that forms of a word match each
 * other: abate, abates, abated and abating all give "abat". It takes off one
 * common ending and then a final "e". It is deliberately simple. It misses
 * some forms (running and run) and joins a few unrelated words, which is
 * fine for ranking search results.
 */
export function stem(word: string): string {
  let out = word;
  for (const [suffix, replacement] of SUFFIXES) {
    if (!out.endsWith(suffix)) continue;
    // "glass", "callous" and "analysis" are not plurals.
    if (suffix === 's' && /(ss|us|is)$/.test(out)) break;
    const next = out.slice(0, -suffix.length) + replacement;
    if (next.length >= 3) out = next;
    break;
  }
  if (out.length > 3 && out.endsWith('e')) out = out.slice(0, -1);
  return out;
}

function stemAll(normalized: string): string {
  return normalized.split(' ').map(stem).join(' ');
}

/**
 * The number of single-letter edits (add, drop, change, or swap two
 * neighbours) between two strings, or `max + 1` once it is sure to be more
 * than `max`.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, before[j - 2]! + 1);
      }
      row.push(d);
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return max + 1;
    before = prev;
    prev = row;
  }
  return Math.min(prev[b.length]!, max + 1);
}

/**
 * How close a headword's spelling is to the search: "word" when the whole
 * headword is a typo away (one edit for four to seven letters, two for
 * more), "start" when only its start is one edit off (from five letters, so
 * a typo shows up mid-word), else null.
 */
function closeSpelling(head: string, q: string): 'word' | 'start' | null {
  const max = q.length >= 8 ? 2 : 1;
  if (editDistance(head, q, max) <= max) return 'word';
  if (q.length >= 5 && head.length > q.length && editDistance(head.slice(0, q.length), q, 1) <= 1) {
    return 'start';
  }
  return null;
}

interface RelationEntry {
  /** As the content writes it, for the match label. */
  lemma: string;
  norm: string;
  stem: string;
  type: 'synonym' | 'antonym';
  /** Its place among the word's synonyms or antonyms. 0 is the closest. */
  place: number;
}

interface SenseEntry {
  /** The definitions, normalized, with a space at each end. */
  padded: string;
  words: string[];
  stems: string[];
}

interface Entry {
  word: WordContent;
  /** Its place in the collection, for ties. */
  order: number;
  head: string;
  headStem: string;
  relations: RelationEntry[];
  senses: SenseEntry[];
  roots: Set<string>;
}

/** The collection, prepared once so each keystroke only compares strings. */
export interface SearchIndex {
  entries: Entry[];
  /** Normalized headword to the words that have it. */
  byHead: Map<string, Entry[]>;
}

export function buildSearchIndex(words: readonly WordContent[]): SearchIndex {
  const entries = words.map((word, order): Entry => {
    const head = normalize(word.headword);
    const places = { synonym: 0, antonym: 0 };
    const relations: RelationEntry[] = [];
    for (const r of word.relations) {
      if (r.relationType !== 'synonym' && r.relationType !== 'antonym') continue;
      const norm = normalize(r.relatedLemma);
      if (norm === '' || norm === head) continue;
      relations.push({
        lemma: r.relatedLemma.trim(),
        norm,
        stem: stemAll(norm),
        type: r.relationType,
        place: places[r.relationType]++,
      });
    }
    const senses = word.senses.map((s): SenseEntry => {
      const text = normalize(`${s.definition} ${s.plainLanguageDefinition ?? ''}`);
      const split = text === '' ? [] : text.split(' ');
      return { padded: ` ${text} `, words: split, stems: split.map(stem) };
    });
    return {
      word,
      order,
      head,
      headStem: stemAll(head),
      relations,
      senses,
      roots: new Set(word.roots.map((r) => r.trim().toLowerCase()).filter((r) => r !== '')),
    };
  });
  const byHead = new Map<string, Entry[]>();
  for (const e of entries) byHead.set(e.head, [...(byHead.get(e.head) ?? []), e]);
  return { entries, byHead };
}

/** The word in the collection spelled like `text`, if there is one. */
export function wordNamed(index: SearchIndex, text: string): WordContent | undefined {
  return index.byHead.get(normalize(text))?.[0]?.word;
}

/** The definition words that match the search's words, all of them in a row, or null. */
function mentionedWords(sense: SenseEntry, qStems: string[]): string | null {
  const last = sense.stems.length - qStems.length;
  for (let i = 0; i <= last; i++) {
    if (qStems.every((s, j) => sense.stems[i + j] === s)) {
      return sense.words.slice(i, i + qStems.length).join(' ');
    }
  }
  return null;
}

/** The definition words that start with the search, up to the end of the last one, or null. */
function mentionedStart(sense: SenseEntry, q: string): string | null {
  const at = sense.padded.indexOf(` ${q}`);
  if (at < 0) return null;
  const start = at + 1;
  return sense.padded.slice(start, sense.padded.indexOf(' ', start + q.length));
}

interface Candidate {
  entry: Entry;
  tier: number;
  rank: number;
  match: SearchMatch;
}

/**
 * The words that match a search, best first (see the top of this file). An
 * empty search returns every word, in the collection's order.
 */
export function searchWords(index: SearchIndex, query: string): SearchHit[] {
  const q = normalize(query);
  if (q === '') return index.entries.map((e) => ({ word: e.word, match: HEADWORD }));
  const qStem = stemAll(q);
  const qStems = qStem.split(' ');
  const searchMeanings = q.length >= 3 && !STOP_WORDS.has(q);

  const best = new Map<Entry, Candidate>();
  function offer(entry: Entry, tier: number, rank: number, match: SearchMatch) {
    const held = best.get(entry);
    if (held && (held.tier < tier || (held.tier === tier && held.rank <= rank))) return;
    best.set(entry, { entry, tier, rank, match });
  }

  // The words the search names, for their own synonyms, antonyms and roots.
  const named: Entry[] = [];

  for (const e of index.entries) {
    if (e.head === q) {
      offer(e, TIER.exact, 0, HEADWORD);
      named.push(e);
    } else if (e.headStem === qStem) {
      offer(e, TIER.form, 0, HEADWORD);
      named.push(e);
    } else if (e.head.startsWith(q)) {
      offer(e, TIER.prefix, 0, HEADWORD);
    } else if (q.length >= 2 && e.head.includes(q)) {
      offer(e, TIER.contains, 0, HEADWORD);
    } else if (q.length >= 4) {
      const close = closeSpelling(e.head, q);
      if (close) {
        offer(e, close === 'word' ? TIER.spelling : TIER.spellingStart, 0, { kind: 'spelling' });
      }
    }

    for (const r of e.relations) {
      const synonym = r.type === 'synonym';
      const match: SearchMatch = { kind: synonym ? 'similar' : 'opposite', word: r.lemma };
      if (r.norm === q || r.stem === qStem) {
        offer(e, synonym ? TIER.similar : TIER.opposite, r.place, match);
      } else if (q.length >= 3 && r.norm.startsWith(q)) {
        offer(e, synonym ? TIER.similarPrefix : TIER.oppositePrefix, r.place, match);
      }
    }

    if (searchMeanings) {
      e.senses.forEach((sense, i) => {
        const whole = mentionedWords(sense, qStems);
        if (whole) {
          offer(e, TIER.meaning, i, { kind: 'meaning', word: whole });
          return;
        }
        const start = mentionedStart(sense, q);
        if (start) offer(e, TIER.meaningPrefix, i, { kind: 'meaning', word: start });
      });
    }
  }

  for (const n of named) {
    const headword = n.word.headword;
    for (const r of n.relations) {
      const synonym = r.type === 'synonym';
      for (const other of index.byHead.get(r.norm) ?? []) {
        if (other === n) continue;
        offer(other, synonym ? TIER.similar : TIER.opposite, r.place, {
          kind: synonym ? 'similar' : 'opposite',
          word: headword,
        });
      }
    }
    for (const other of index.entries) {
      if (other === n) continue;
      if ([...other.roots].some((root) => n.roots.has(root))) {
        offer(other, TIER.sameRoot, 0, { kind: 'sameRoot', word: headword });
      }
      for (const r of n.relations) {
        const theirs = other.relations.find((o) => o.type === r.type && o.norm === r.norm);
        if (!theirs) continue;
        const synonym = r.type === 'synonym';
        offer(other, synonym ? TIER.sharedSynonym : TIER.sharedAntonym, r.place + theirs.place, {
          kind: synonym ? 'similar' : 'opposite',
          word: r.lemma,
        });
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => a.tier - b.tier || a.rank - b.rank || a.entry.order - b.entry.order)
    .map((c) => ({ word: c.entry.word, match: c.match }));
}

/**
 * The note a result row shows under its headword: a small-caps label and the
 * word it relates to. Null for a headword match, which needs no note.
 */
export function matchNote(match: SearchMatch): { label: string; word: string | null } | null {
  switch (match.kind) {
    case 'headword':
      return null;
    case 'spelling':
      return { label: 'Close spelling', word: null };
    case 'similar':
      return { label: 'Similar to', word: match.word };
    case 'opposite':
      return { label: 'Opposite of', word: match.word };
    case 'sameRoot':
      return { label: 'Same root as', word: match.word };
    case 'meaning':
      return { label: 'Meaning mentions', word: match.word };
  }
}

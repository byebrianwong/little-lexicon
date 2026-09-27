// Open English WordNet (OEWN), the source stage 02 uses for definitions,
// examples, synonyms, antonyms and pronunciation (SPEC.md section 5).
//
// The release is a pinned zip of JSON files. It is downloaded once into
// pipeline/.cache/oewn, checked against a SHA-256, and read from disk, so
// lookups need no network. OEWN is licensed CC BY 4.0: the app must credit it,
// and the export writes OEWN_ATTRIBUTION into the words file.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from './logger.ts';

export const OEWN_RELEASE = {
  edition: '2025',
  url: 'https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025-json.zip',
  sha256: '7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51',
} as const;

export const OEWN_ATTRIBUTION =
  'Definitions, dictionary examples, synonyms, antonyms and pronunciations from ' +
  'Open English WordNet 2025 (https://en-word.net/), licensed CC BY 4.0.';

// --- Raw OEWN JSON shapes -----------------------------------------------------

export interface OewnSense {
  id: string; // sense key, for example "laconic%5:00:00:concise:00"
  synset: string; // synset id, for example "00549861-s"
  antonym?: string[]; // sense keys
}

export interface OewnEntryPos {
  pronunciation?: { value: string; variety?: string }[];
  sense: OewnSense[];
}

/** lemma -> part-of-speech key ("n", "v", "a", "s", "r", or "n-1" for homographs). */
export type OewnEntries = Record<string, Record<string, OewnEntryPos>>;

export interface OewnSynset {
  definition: string[];
  example?: (string | { text: string; source?: string })[];
  members: string[];
  partOfSpeech: string;
  similar?: string[];
}

export type OewnSynsets = Record<string, OewnSynset>;

export interface WordNetData {
  entries: OewnEntries;
  synsets: OewnSynsets;
  /** Every sense that points at a synset, for finding antonyms of a synset. */
  sensesBySynset: Map<string, OewnSense[]>;
}

// --- Lookup result --------------------------------------------------------------

export interface WordNetExample {
  text: string;
  clozeTarget: string;
}

export interface WordNetSense {
  definition: string;
  examples: WordNetExample[];
}

export interface WordNetResult {
  partOfSpeech: string;
  ipa: string | null;
  senses: WordNetSense[];
  synonyms: string[];
  antonyms: string[];
}

export interface LookupLimits {
  maxSenses: number;
  maxExamplesPerSense: number;
  maxRelationsPerType: number;
}

const POS_NAMES: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  a: 'adjective',
  s: 'adjective',
  r: 'adverb',
};

// Datamuse part-of-speech tags, mapped to the same names.
const DATAMUSE_POS: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  adj: 'adjective',
  adv: 'adverb',
};

export function posNameFromDatamuse(tag: string): string | null {
  return DATAMUSE_POS[tag] ?? null;
}

/** "laconic%5:00:00:concise:00" -> "laconic"; "short_story%1:.." -> "short story". */
export function lemmaFromSenseKey(senseKey: string): string {
  const cut = senseKey.indexOf('%');
  return (cut === -1 ? senseKey : senseKey.slice(0, cut)).replace(/_/g, ' ');
}

/** WordNet glosses are lowercase fragments. Show them as sentences. */
export function formatDefinition(gloss: string): string {
  const trimmed = gloss.trim();
  if (!trimmed) return trimmed;
  const capped = trimmed[0]!.toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The spellings of a headword that count as "the word" inside an example. */
export function inflections(word: string): string[] {
  const forms = new Set([word, `${word}s`, `${word}es`, `${word}ed`, `${word}d`, `${word}ing`]);
  if (word.endsWith('e')) {
    forms.add(`${word.slice(0, -1)}ing`);
  }
  if (/[^aeiou]y$/.test(word)) {
    const stem = word.slice(0, -1);
    forms.add(`${stem}ies`);
    forms.add(`${stem}ied`);
  }
  return [...forms];
}

/**
 * The token in `text` that is the headword (or an inflection of it), exactly as
 * written, or null when the example does not use the word. WordNet examples
 * belong to a synset, so many use a synonym instead of the headword.
 */
export function findWordToken(text: string, word: string): string | null {
  const pattern = new RegExp(`\\b(${inflections(word).map(escapeRegExp).join('|')})\\b`, 'i');
  const match = pattern.exec(text);
  return match ? match[0] : null;
}

function exampleText(raw: string | { text: string }): string {
  return (typeof raw === 'string' ? raw : raw.text).trim();
}

function pickIpa(entries: OewnEntryPos[]): string | null {
  const all = entries.flatMap((e) => e.pronunciation ?? []);
  const chosen =
    all.find((p) => p.variety === 'US') ?? all.find((p) => !p.variety) ?? all[0] ?? null;
  return chosen ? `/${chosen.value}/` : null;
}

// WordNet lists vulgar and slur synonyms alongside ordinary ones ("ass-kisser"
// for sycophant). Related words appear as answer options, so these are dropped.
// Whole-word matches only, so "assuage" and "cockle" stay.
const OFFENSIVE =
  /\b(ass|arse|bastard\w*|bitch\w*|cock|crap\w*|cunt\w*|dick|dickhead|fuck\w*|nigg\w*|piss\w*|prick|retard\w*|shit\w*|slut\w*|twat|wank\w*|whore\w*)\b/;

export function isOffensive(lemma: string): boolean {
  return OFFENSIVE.test(lemma.toLowerCase());
}

function dedupeLemmas(values: string[], exclude: Set<string>, max: number): string[] {
  const out: string[] = [];
  const seen = new Set(exclude);
  for (const v of values) {
    const lemma = v.trim().toLowerCase();
    if (!/^[a-z][a-z '-]*$/.test(lemma) || seen.has(lemma) || isOffensive(lemma)) continue;
    seen.add(lemma);
    out.push(lemma);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Look a headword up. Senses come from one part of speech only, so the word's
 * part-of-speech label matches every definition the app shows. The part of
 * speech is the first one in `posPreference` (most common first, from
 * Datamuse) that WordNet has; otherwise the one with the most senses.
 * Returns null when WordNet has no entry.
 */
export function lookupWord(
  data: WordNetData,
  headword: string,
  posPreference: string[],
  limits: LookupLimits,
): WordNetResult | null {
  const entry = data.entries[headword];
  if (!entry) return null;

  // Group the entry's part-of-speech keys ("n", "n-1", "s", ...) by name.
  const byPos = new Map<string, OewnEntryPos[]>();
  for (const [key, value] of Object.entries(entry)) {
    const name = POS_NAMES[key[0]!];
    if (!name) continue;
    const list = byPos.get(name) ?? [];
    list.push(value);
    byPos.set(name, list);
  }
  if (byPos.size === 0) return null;

  const senseCount = (name: string): number =>
    (byPos.get(name) ?? []).reduce((n, e) => n + e.sense.length, 0);
  const partOfSpeech =
    posPreference.find((p) => byPos.has(p)) ??
    [...byPos.keys()].sort((a, b) => senseCount(b) - senseCount(a))[0]!;
  const posEntries = byPos.get(partOfSpeech)!;

  const senses: WordNetSense[] = [];
  const synsetIds: string[] = [];
  const seenDefinitions = new Set<string>();
  for (const sense of posEntries.flatMap((e) => e.sense)) {
    if (senses.length >= limits.maxSenses) break;
    const synset = data.synsets[sense.synset];
    const gloss = synset?.definition[0];
    if (!synset || !gloss) continue;
    const definition = formatDefinition(gloss);
    if (seenDefinitions.has(definition.toLowerCase())) continue;
    seenDefinitions.add(definition.toLowerCase());

    const examples: WordNetExample[] = [];
    for (const raw of synset.example ?? []) {
      if (examples.length >= limits.maxExamplesPerSense) break;
      const plain = exampleText(raw);
      if (!plain) continue;
      const text = plain[0]!.toUpperCase() + plain.slice(1);
      const token = findWordToken(text, headword);
      if (token) examples.push({ text, clozeTarget: token });
    }
    senses.push({ definition, examples });
    synsetIds.push(sense.synset);
  }
  if (senses.length === 0) return null;

  const self = new Set([headword.toLowerCase()]);
  const synonyms = dedupeLemmas(
    synsetIds.flatMap((id) => data.synsets[id]?.members ?? []),
    self,
    limits.maxRelationsPerType,
  );

  // Direct antonyms sit on the word's own senses. Adjective satellites ("-s"
  // synsets) rarely have any, so also take the antonyms of the head adjective
  // they are similar to (ephemeral -> impermanent <-> permanent).
  const chosenSenses = posEntries
    .flatMap((e) => e.sense)
    .filter((s) => synsetIds.includes(s.synset));
  const antonymKeys = chosenSenses.flatMap((s) => s.antonym ?? []);
  for (const id of synsetIds) {
    if (!id.endsWith('-s')) continue;
    for (const head of data.synsets[id]?.similar ?? []) {
      for (const s of data.sensesBySynset.get(head) ?? []) antonymKeys.push(...(s.antonym ?? []));
    }
  }
  const antonyms = dedupeLemmas(
    antonymKeys.map(lemmaFromSenseKey),
    new Set([...self, ...synonyms]),
    limits.maxRelationsPerType,
  );

  return { partOfSpeech, ipa: pickIpa(posEntries), senses, synonyms, antonyms };
}

// --- Loading ------------------------------------------------------------------

export function indexSensesBySynset(entries: OewnEntries): Map<string, OewnSense[]> {
  const map = new Map<string, OewnSense[]>();
  for (const byPos of Object.values(entries)) {
    for (const pos of Object.values(byPos)) {
      for (const sense of pos.sense) {
        const list = map.get(sense.synset) ?? [];
        list.push(sense);
        map.set(sense.synset, list);
      }
    }
  }
  return map;
}

/** Download and unpack the pinned release if the cache does not have it yet. */
export async function ensureWordNet(cacheDir: string, log: Logger): Promise<string> {
  const dir = join(cacheDir, 'oewn');
  if (existsSync(join(dir, 'entries-a.json'))) return dir;

  await mkdir(dir, { recursive: true });
  log.info(`Downloading Open English WordNet ${OEWN_RELEASE.edition} (about 10 MB).`);
  const res = await fetch(OEWN_RELEASE.url);
  if (!res.ok) {
    throw new Error(`WordNet download failed: HTTP ${res.status} from ${OEWN_RELEASE.url}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== OEWN_RELEASE.sha256) {
    throw new Error(
      `WordNet download checksum mismatch: expected ${OEWN_RELEASE.sha256}, got ${sha256}.`,
    );
  }
  const zipPath = join(dir, 'oewn.zip');
  await writeFile(zipPath, bytes);
  try {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', dir]);
  } catch (err) {
    throw new Error(
      `Could not unpack ${zipPath} with the unzip command: ${(err as Error).message}`,
    );
  }
  return dir;
}

/** Read every entries-*.json and synset file (about 80 MB of JSON). */
export function loadWordNet(dir: string): WordNetData {
  const entries: OewnEntries = {};
  const synsets: OewnSynsets = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown;
    if (file.startsWith('entries-')) Object.assign(entries, parsed as OewnEntries);
    else if (/^(adj|adv|noun|verb)\./.test(file)) Object.assign(synsets, parsed as OewnSynsets);
  }
  if (Object.keys(entries).length === 0 || Object.keys(synsets).length === 0) {
    throw new Error(`No WordNet data found in ${dir}. Delete the folder and re-run to download it.`);
  }
  return { entries, synsets, sensesBySynset: indexSensesBySynset(entries) };
}

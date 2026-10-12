// Curation commands, for improving word entries inside a Claude Code session
// with no paid API. The process is in .claude/skills/improve-words/SKILL.md.
//
//   npx tsx src/curate.ts status
//   npx tsx src/curate.ts next [--count=N] [--words=a,b,c]   write a worksheet
//   npx tsx src/curate.ts next --count=100 --split=8         write 8 worksheets for a big run
//   npx tsx src/curate.ts check <worksheet...>               run the checks, on several together
//   npx tsx src/curate.ts apply <worksheet>                  write it and export
//   npx tsx src/curate.ts pos <word...>                      parts of speech in WordNet, for look-alikes
//   npx tsx src/curate.ts reports                            fetch learners' open reports (needs Supabase keys)
//   npx tsx src/curate.ts next --reported                    write a worksheet of the reported words
//   npx tsx src/curate.ts resolve <worksheet...>             after apply, mark those words' reports resolved
//   npx tsx src/curate.ts ipa <file.tsv>                     set pronunciations (headword<TAB>/ipa/ per line) and export
//
// Worksheets go to out/curate/ (git-ignored). `apply` refuses the whole
// worksheet if any word fails a check, so the record never holds half a batch.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext } from './config.ts';
import { Logger } from './lib/logger.ts';
import { JsonFileStore } from './lib/store.ts';
import { ensureWordNet, loadWordNet, partsOfSpeechOf } from './lib/wordnet.ts';
import type { Lexicon } from './lib/revise.ts';
import {
  buildEntry,
  changedFields,
  checkContent,
  checkIpa,
  checkReview,
  CRITERIA,
  CURATED_REVISION,
  ipaSyllables,
  primarySense,
  problemKind,
  RUBRIC_VERSION,
  splitIntoParts,
  WORKSHEET_INSTRUCTIONS,
  wrongAnswerOwners,
  type CheckEnv,
  type Worksheet,
  type WorksheetEntry,
} from './lib/curate.ts';
import dotenv from 'dotenv';
import { exportWords } from './stages/05-export.ts';
import {
  fetchOpenReports,
  groupByWord,
  reportsAnswered,
  resolveReports,
  toReportNotes,
  type OpenReport,
  type SupabaseAdmin,
} from './lib/reports.ts';
import type { ContentRows } from './lib/exportContent.ts';
import type { ReviewRow, WordRow } from './lib/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_FILE = join(ROOT, 'data', 'content-db.json');
const OUT_DIR = join(ROOT, 'out', 'curate');
const REPORTS_FILE = join(OUT_DIR, 'reports.json');
const log = new Logger(false);

async function openRecord(): Promise<{ store: JsonFileStore; rows: ContentRows; reviews: ReviewRow[] }> {
  const store = new JsonFileStore(DB_FILE, join(ROOT, '..', 'assets', 'audio'), false, log);
  await store.init();
  // Retired words are not taught, so they are not reviewed. Writes go through
  // the store, which still holds every row.
  const all = await store.snapshot();
  const rows = { ...all, words: all.words.filter((w) => !w.retired) };
  return { store, rows, reviews: await store.listReviews() };
}

async function openLexicon(): Promise<Lexicon> {
  const wordnet = loadWordNet(await ensureWordNet(join(ROOT, '.cache'), log));
  return (lemma) => partsOfSpeechOf(wordnet, lemma);
}

/** The newest review per word at the current rubric version. */
function currentReviews(reviews: ReviewRow[]): Map<number, ReviewRow> {
  const out = new Map<number, ReviewRow>();
  for (const r of reviews) {
    if (r.rubric_version === RUBRIC_VERSION) out.set(r.word_id, r);
  }
  return out;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- status -------------------------------------------------------------------

async function status(): Promise<void> {
  const { rows, reviews } = await openRecord();
  const lexicon = await openLexicon();
  const done = currentReviews(reviews);
  // Retired words keep their reviews but are not counted.
  const active = new Set(rows.words.map((w) => w.id));
  for (const id of done.keys()) if (!active.has(id)) done.delete(id);
  const verdicts = { pass: 0, fixed: 0, flagged: 0 };
  for (const r of done.values()) verdicts[r.verdict] += 1;

  const env: CheckEnv = { lexicon, takenWrongAnswers: wrongAnswerOwners(rows, new Set()) };
  const kinds = new Map<string, number>();
  let wordsWithProblems = 0;
  for (const word of rows.words) {
    if (done.has(word.id) || !primarySense(rows, word.id)) continue;
    const problems = checkContent(buildEntry(rows, word), env);
    if (problems.length > 0) wordsWithProblems += 1;
    for (const k of new Set(problems.map(problemKind))) kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }

  console.log(`Rubric version ${RUBRIC_VERSION}. ${rows.words.length} words.`);
  console.log(
    `Reviewed: ${done.size} (pass ${verdicts.pass}, fixed ${verdicts.fixed}, flagged ${verdicts.flagged}). ` +
      `To review: ${rows.words.length - done.size}.`,
  );
  const unchecked = [...done.values()].filter((r) => !r.checker_scores);
  if (unchecked.length > 0) {
    const names = unchecked.map((r) => rows.words.find((w) => w.id === r.word_id)?.headword).join(', ');
    console.log(`  ${unchecked.length} reviewed without a second reviewer; review them again: ${names}`);
  }
  const flagged = [...done.values()].filter((r) => r.verdict === 'flagged');
  for (const r of flagged) {
    const w = rows.words.find((x) => x.id === r.word_id);
    console.log(`  flagged: ${w?.headword}: ${r.notes}`);
  }
  const badIpa = rows.words.filter((w) => !w.ipa || checkIpa(w.ipa).length > 0);
  if (badIpa.length > 0) {
    console.log(`  pronunciation missing or not in house style: ${badIpa.map((w) => w.headword).join(', ')}`);
  }
  console.log(`\nUnreviewed words failing the checks: ${wordsWithProblems}. Most common problems:`);
  for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(n).padStart(4)} words  ${k}`);
  }
}

// --- next ---------------------------------------------------------------------

function parseOption(args: string[], name: string): string | undefined {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function next(args: string[]): Promise<void> {
  const { rows, reviews } = await openRecord();
  const lexicon = await openLexicon();
  const count = Number.parseInt(parseOption(args, 'count') ?? '12', 10);
  const named = parseOption(args, 'words')?.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const done = currentReviews(reviews);

  const reported = args.includes('--reported') ? groupByWord(await readReportsFile()) : null;

  let words: WordRow[];
  if (reported) {
    // Reported words, oldest report first, whether or not they were reviewed.
    words = [...reported.keys()]
      .map((id) => rows.words.find((w) => w.id === id))
      .filter((w): w is WordRow => w !== undefined)
      .slice(0, count);
  } else if (named) {
    words = named.map((h) => {
      const w = rows.words.find((x) => x.headword === h);
      if (!w) throw new Error(`No word "${h}" in the record`);
      return w;
    });
  } else {
    // Unreviewed words; ones that give the answer away first, then record order.
    const env: CheckEnv = { lexicon, takenWrongAnswers: wrongAnswerOwners(rows, new Set()) };
    const unchecked = rows.words.filter((w) => done.has(w.id) && !done.get(w.id)!.checker_scores);
    const candidates = rows.words
      .filter((w) => !done.has(w.id) && primarySense(rows, w.id))
      .map((w) => ({ w, giveaway: checkContent(buildEntry(rows, w), env).some((p) => p.includes('names the word')) }));
    // Words reviewed before the second reviewer existed come first.
    words = [
      ...unchecked,
      ...candidates.filter((c) => c.giveaway).map((c) => c.w),
      ...candidates.filter((c) => !c.giveaway).map((c) => c.w),
    ].slice(0, count);
  }
  if (words.length === 0) {
    console.log('Nothing to review at this rubric version.');
    return;
  }

  const env: CheckEnv = {
    lexicon,
    takenWrongAnswers: wrongAnswerOwners(rows, new Set(words.map((w) => w.id))),
  };
  const entries = words.map((w) => {
    const entry = buildEntry(rows, w);
    const withProblems = { ...entry, problems: checkContent(entry, env) };
    const open = reported?.get(w.id);
    return open ? { ...withProblems, reports: toReportNotes(open), ipa: w.ipa } : withProblems;
  });
  // --split=K writes K worksheets, one per writer subagent in a big run.
  const parts = splitIntoParts(entries, Number.parseInt(parseOption(args, 'split') ?? '1', 10));
  const createdAt = new Date().toISOString();
  const stamp = createdAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  await mkdir(OUT_DIR, { recursive: true });
  for (const [i, part] of parts.entries()) {
    const sheet: Worksheet = { rubricVersion: RUBRIC_VERSION, createdAt, instructions: WORKSHEET_INSTRUCTIONS, words: part };
    if (reported) sheet.lastReviewId = Math.max(0, ...reviews.map((r) => r.id));
    const suffix = parts.length > 1 ? `-${String.fromCharCode(97 + i)}` : '';
    const file = join(OUT_DIR, `worksheet-${stamp}${suffix}.json`);
    await writeFile(file, JSON.stringify(sheet, null, 2) + '\n', 'utf8');
    console.log(file);
    for (const e of part) {
      const reportCount = e.reports ? `, ${e.reports.length} report${e.reports.length === 1 ? '' : 's'}` : '';
      console.log(
        `  ${e.headword.padEnd(16)} ${e.problems!.length} problems${reportCount}${done.has(e.wordId) ? ' (already reviewed)' : ''}`,
      );
    }
  }
}

// --- check and apply ----------------------------------------------------------

interface Checked {
  entry: WorksheetEntry;
  before: WorksheetEntry;
  changed: string[];
  problems: string[];
}

async function readSheet(file: string): Promise<Worksheet> {
  if (!existsSync(file)) throw new Error(`No worksheet at ${file}`);
  const sheet = JSON.parse(await readFile(file, 'utf8')) as Worksheet;
  if (sheet.rubricVersion !== RUBRIC_VERSION) {
    throw new Error(`${file} uses rubric ${sheet.rubricVersion}; the current rubric is ${RUBRIC_VERSION}. Make a new one.`);
  }
  return sheet;
}

/**
 * Check one or more worksheets together. Checked together, a wrong answer
 * that two unapplied worksheets both use is caught before either is applied.
 */
async function checkSheets(files: string[], rows: ContentRows, lexicon: Lexicon): Promise<Checked[][]> {
  const sheets = await Promise.all(files.map(readSheet));
  const all = sheets.flatMap((s) => s.words);
  const ids = new Set(all.map((w) => w.wordId));
  if (ids.size !== all.length) throw new Error('A word appears twice across the worksheets');
  // Wrong answers must be unique across the whole word list, including the
  // other words in these worksheets.
  const owners = wrongAnswerOwners(rows, ids);
  const env: CheckEnv = { lexicon, takenWrongAnswers: owners };
  return sheets.map((sheet) => sheet.words.map((entry) => checkEntry(entry, rows, env)));
}

/** Check one entry, then claim its wrong answers so later entries cannot reuse them. */
function checkEntry(entry: WorksheetEntry, rows: ContentRows, env: CheckEnv): Checked {
  const word = rows.words.find((w) => w.id === entry.wordId);
  if (!word || word.headword !== entry.headword) {
    return { entry, before: entry, changed: [], problems: [`wordId ${entry.wordId} is not "${entry.headword}" in the record`] };
  }
  const before = buildEntry(rows, word);
  const changed = changedFields(before, entry);
  const problems = [...checkContent(entry, env), ...checkReview(entry, changed)];
  if (changed.includes('partOfSpeech')) {
    const kept = entry.otherSenses.filter((s) => before.otherSenses.includes(s));
    if (kept.length > 0) {
      problems.push(
        `the part of speech changed, but otherSenses still holds senses of the old one: ${kept.map((s) => `"${s.slice(0, 40)}"`).join(', ')}`,
      );
    }
  }
  for (const wa of entry.wrongAnswers) env.takenWrongAnswers.set(wa.meaning.trim().toLowerCase(), entry.wordId);
  return { entry, before, changed, problems };
}

function report(checked: Checked[]): number {
  let failing = 0;
  for (const c of checked) {
    const label = `${c.entry.headword} (${c.changed.length ? c.changed.join(', ') : 'no changes'})`;
    if (c.problems.length === 0) {
      console.log(`ok    ${label}`);
    } else {
      failing += 1;
      console.log(`FAIL  ${label}`);
      for (const p of c.problems) console.log(`        - ${p}`);
    }
  }
  return failing;
}

async function check(files: string[]): Promise<void> {
  const { rows } = await openRecord();
  const results = await checkSheets(files, rows, await openLexicon());
  let failing = 0;
  for (const [i, checked] of results.entries()) {
    if (files.length > 1) console.log(`\n${files[i]}`);
    failing += report(checked);
  }
  console.log(failing ? `\n${failing} words fail. Fix them and check again.` : '\nAll words pass. Apply each worksheet with: npx tsx src/curate.ts apply <worksheet>');
  if (failing) process.exitCode = 1;
}

async function apply(file: string): Promise<void> {
  const { store, rows } = await openRecord();
  const [checked] = await checkSheets([file], rows, await openLexicon());
  const failing = report(checked);
  if (failing) {
    console.log(`\n${failing} words fail. Nothing was written.`);
    process.exitCode = 1;
    return;
  }

  for (const { entry, before, changed } of checked) {
    const word = rows.words.find((w) => w.id === entry.wordId)!;
    const primary = primarySense(rows, word.id)!;
    const has = (f: string): boolean => changed.includes(f);

    if (has('partOfSpeech')) {
      await store.updateWordMeta(word.id, { part_of_speech: entry.partOfSpeech });
    }
    if (has('partOfSpeech') || has('otherSenses')) {
      await store.setOtherSenses(word.id, primary.id, entry.otherSenses);
    }
    if (has('definition') || has('plain')) {
      await store.updateSense(primary.id, {
        definition: entry.definition.trim(),
        plain_language_definition: entry.plain.trim(),
      });
    }
    if (has('examples')) {
      const old = rows.example_sentences.filter((e) => e.sense_id === primary.id);
      await store.replaceExamples(
        primary.id,
        entry.examples.map((ex) => {
          const kept = old.find((o) => o.text.trim() === ex.text.trim());
          return {
            sense_id: primary.id,
            text: ex.text.trim(),
            cloze_target: ex.cloze,
            audio_url: kept?.audio_url ?? null,
            source: kept?.source ?? 'claude',
            is_generated: kept?.is_generated ?? true,
          };
        }),
      );
    }
    if (has('wrongAnswers') || entry.wrongAnswers.some((w, i) => w.lookalike !== before.wrongAnswers[i]?.lookalike)) {
      const old = rows.distractors.filter((d) => d.sense_id === primary.id);
      await store.replaceDistractors(
        primary.id,
        entry.wrongAnswers.map((wa) => ({
          sense_id: primary.id,
          distractor_lemma: wa.meaning.trim(),
          kind: 'mc',
          difficulty: word.difficulty_tier,
          source: old.find((o) => o.distractor_lemma.trim() === wa.meaning.trim())?.source ?? 'claude',
          revision: CURATED_REVISION,
          lookalike: wa.lookalike.trim().toLowerCase(),
        })),
      );
    }
    if (has('hook')) {
      await store.replaceGlobalMnemonic(word.id, {
        word_id: word.id,
        text: entry.hook.trim(),
        source: 'claude',
        user_id: null,
        revision: CURATED_REVISION,
      });
    }
    if (has('synonyms') || has('antonyms')) {
      const old = rows.word_relations.filter((r) => r.word_id === word.id);
      const relation = (lemma: string, type: 'synonym' | 'antonym') => ({
        word_id: word.id,
        related_lemma: lemma,
        relation_type: type,
        source: old.find((o) => o.related_lemma === lemma && o.relation_type === type)?.source ?? ('claude' as const),
      });
      await store.replaceRelations(word.id, [
        ...entry.synonyms.map((l) => relation(l, 'synonym')),
        ...entry.antonyms.map((l) => relation(l, 'antonym')),
      ]);
    }
    const scores = Object.fromEntries(CRITERIA.map((c) => [c, entry.review.scores![c]!]));
    await store.addReview({
      word_id: word.id,
      rubric_version: RUBRIC_VERSION,
      reviewed_at: today(),
      scores,
      verdict: entry.review.verdict!,
      changed,
      notes: entry.review.notes.trim(),
      checker_scores: Object.fromEntries(CRITERIA.map((c) => [c, entry.checker.scores![c]!])),
      checker_notes: entry.checker.notes.trim(),
    });
  }
  await store.flush();
  console.log(`\nApplied ${checked.length} words to ${DB_FILE}.`);

  // Export the app's words file from the updated record.
  const ctx = await createContext({ only: 'export', dryRun: false, limit: null, verbose: false });
  await ctx.store.init();
  await exportWords(ctx);
}

/** Print each word's parts of speech in WordNet, to check a look-alike before using it. */
async function pos(words: string[]): Promise<void> {
  const lexicon = await openLexicon();
  for (const w of words) console.log(`${w}: ${lexicon(w)?.join(', ') ?? 'not in WordNet'}`);
}

/**
 * Set pronunciations from a file of `headword<TAB>/ipa/` lines, and the
 * syllable count from each one. Writes nothing if any line fails the check.
 */
async function ipa(file: string): Promise<void> {
  const { store, rows } = await openRecord();
  const lines = (await readFile(file, 'utf8')).split('\n').filter((l) => l.trim());
  const problems: string[] = [];
  const updates: { word: WordRow; ipa: string }[] = [];
  for (const line of lines) {
    const [headword = '', value = ''] = line.split('\t').map((x) => x.trim());
    const word = rows.words.find((w) => w.headword === headword);
    if (!word) problems.push(`${headword}: not in the record`);
    for (const p of checkIpa(value)) problems.push(`${headword}: ${p}`);
    if (word) updates.push({ word, ipa: value });
  }
  if (problems.length > 0) {
    for (const p of problems) console.log(p);
    console.log(`\n${problems.length} problems. Nothing was written.`);
    process.exitCode = 1;
    return;
  }
  let changed = 0;
  for (const { word, ipa: value } of updates) {
    const syllables = ipaSyllables(value);
    if (word.ipa === value && word.syllables === syllables) continue;
    await store.updateWordMeta(word.id, { ipa: value, syllables });
    changed += 1;
  }
  await store.flush();
  console.log(`Set ${changed} of ${updates.length} pronunciations in ${DB_FILE}.`);

  const ctx = await createContext({ only: 'export', dryRun: false, limit: null, verbose: false });
  await ctx.store.init();
  await exportWords(ctx);
}

// --- learners' reports ------------------------------------------------------

function supabaseAdmin(): SupabaseAdmin {
  dotenv.config({ path: join(ROOT, '.env') });
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in pipeline/.env (see pipeline/.env.example)');
  }
  return { url: url.replace(/\/+$/, ''), serviceRoleKey };
}

async function readReportsFile(): Promise<OpenReport[]> {
  if (!existsSync(REPORTS_FILE)) throw new Error(`No ${REPORTS_FILE}. Run: npx tsx src/curate.ts reports`);
  return (JSON.parse(await readFile(REPORTS_FILE, 'utf8')) as { reports: OpenReport[] }).reports;
}

/** Fetch the open reports, save them for `next --reported`, and list them by word. */
async function reports(): Promise<void> {
  const { rows } = await openRecord();
  const open = await fetchOpenReports(supabaseAdmin());
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(REPORTS_FILE, JSON.stringify({ fetchedAt: new Date().toISOString(), reports: open }, null, 2) + '\n', 'utf8');
  const groups = groupByWord(open);
  console.log(`${open.length} open reports on ${groups.size} words. Saved to ${REPORTS_FILE}.`);
  for (const [wordId, list] of groups) {
    const headword = rows.words.find((w) => w.id === wordId)?.headword ?? `word ${wordId} (not in the record)`;
    console.log(`\n${headword}`);
    for (const r of list) console.log(`  ${r.createdAt.slice(0, 10)} ${r.reason} (${r.screen})${r.note ? `: ${r.note}` : ''}`);
  }
  if (groups.size > 0) console.log('\nNext: npx tsx src/curate.ts next --reported');
}

/**
 * After a worksheet of reported words is applied, mark the reports it answered
 * resolved. The learner who filed them is not told.
 */
async function resolveCommand(files: string[]): Promise<void> {
  const { rows, reviews } = await openRecord();
  const admin = supabaseAdmin();
  const open = await fetchOpenReports(admin);
  let resolved = 0;
  for (const file of files) {
    const sheet = await readSheet(file);
    const since = sheet.lastReviewId;
    if (since === undefined) throw new Error(`${file} was not made with next --reported, so resolve cannot tell what it answered`);
    const reviewedSince = (wordId: number): boolean => reviews.some((r) => r.word_id === wordId && r.id > since);
    const answered = groupByWord(
      reportsAnswered(open, { createdAt: sheet.createdAt, wordIds: sheet.words.map((w) => w.wordId) }, reviewedSince),
    );
    for (const [wordId, list] of answered) {
      const review = currentReviews(reviews).get(wordId)!;
      const changed = review.changed.length > 0 ? `changed ${review.changed.join(', ')}` : 'no content changes';
      await resolveReports(admin, list.map((r) => r.id), `Reviewed ${review.reviewed_at}: ${changed}. ${review.notes}`.slice(0, 2000));
      resolved += list.length;
      console.log(`${rows.words.find((w) => w.id === wordId)?.headword}: resolved ${list.length}`);
    }
    const skipped = sheet.words.filter((w) => open.some((r) => r.wordId === w.wordId) && !answered.has(w.wordId));
    for (const w of skipped) console.log(`${w.headword}: left open (not applied since the worksheet was made, or filed later)`);
  }
  console.log(`\nResolved ${resolved} reports.`);
}

// --- main ---------------------------------------------------------------------

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const fileArgs = args.filter((a) => !a.startsWith('--')).map((a) => resolve(a));
  if (command === 'status') return status();
  if (command === 'next') return next(args);
  if (command === 'check' && fileArgs.length > 0) return check(fileArgs);
  if (command === 'apply' && fileArgs.length === 1) return apply(fileArgs[0]!);
  if (command === 'pos' && args.length > 0) return pos(args);
  if (command === 'ipa' && fileArgs.length === 1) return ipa(fileArgs[0]!);
  if (command === 'reports') return reports();
  if (command === 'resolve' && fileArgs.length > 0) return resolveCommand(fileArgs);
  console.log(
    'Usage: npx tsx src/curate.ts <status | next [--count=N] [--split=K] [--words=a,b] [--reported] | check <file...> | apply <file> | pos <word...> | ipa <file.tsv> | reports | resolve <file...>>',
  );
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  process.stderr.write(`curate failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

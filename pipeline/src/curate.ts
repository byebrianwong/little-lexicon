// Curation commands, for improving word entries inside a Claude Code session
// with no paid API. The process is in .claude/skills/improve-words/SKILL.md.
//
//   npx tsx src/curate.ts status
//   npx tsx src/curate.ts next [--count=N] [--words=a,b,c]   write a worksheet
//   npx tsx src/curate.ts check <worksheet>                  run the checks
//   npx tsx src/curate.ts apply <worksheet>                  write it and export
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
  checkReview,
  CRITERIA,
  CURATED_REVISION,
  primarySense,
  problemKind,
  RUBRIC_VERSION,
  WORKSHEET_INSTRUCTIONS,
  wrongAnswerOwners,
  type CheckEnv,
  type Worksheet,
  type WorksheetEntry,
} from './lib/curate.ts';
import { exportWords } from './stages/05-export.ts';
import type { ContentRows } from './lib/exportContent.ts';
import type { ReviewRow, WordRow } from './lib/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_FILE = join(ROOT, 'data', 'content-db.json');
const OUT_DIR = join(ROOT, 'out', 'curate');
const log = new Logger(false);

async function openRecord(): Promise<{ store: JsonFileStore; rows: ContentRows; reviews: ReviewRow[] }> {
  const store = new JsonFileStore(DB_FILE, join(ROOT, 'out', 'audio'), false, log);
  await store.init();
  return { store, rows: await store.snapshot(), reviews: await store.listReviews() };
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
  const flagged = [...done.values()].filter((r) => r.verdict === 'flagged');
  for (const r of flagged) {
    const w = rows.words.find((x) => x.id === r.word_id);
    console.log(`  flagged: ${w?.headword}: ${r.notes}`);
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

  let words: WordRow[];
  if (named) {
    words = named.map((h) => {
      const w = rows.words.find((x) => x.headword === h);
      if (!w) throw new Error(`No word "${h}" in the record`);
      return w;
    });
  } else {
    // Unreviewed words; ones that give the answer away first, then record order.
    const env: CheckEnv = { lexicon, takenWrongAnswers: wrongAnswerOwners(rows, new Set()) };
    const candidates = rows.words
      .filter((w) => !done.has(w.id) && primarySense(rows, w.id))
      .map((w) => ({ w, giveaway: checkContent(buildEntry(rows, w), env).some((p) => p.includes('names the word')) }));
    words = [...candidates.filter((c) => c.giveaway), ...candidates.filter((c) => !c.giveaway)]
      .slice(0, count)
      .map((c) => c.w);
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
    return { ...entry, problems: checkContent(entry, env) };
  });
  const sheet: Worksheet = {
    rubricVersion: RUBRIC_VERSION,
    createdAt: new Date().toISOString(),
    instructions: WORKSHEET_INSTRUCTIONS,
    words: entries,
  };
  await mkdir(OUT_DIR, { recursive: true });
  const stamp = sheet.createdAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = join(OUT_DIR, `worksheet-${stamp}.json`);
  await writeFile(file, JSON.stringify(sheet, null, 2) + '\n', 'utf8');
  console.log(file);
  for (const e of entries) {
    console.log(`  ${e.headword.padEnd(16)} ${e.problems.length} problems${done.has(e.wordId) ? ' (already reviewed)' : ''}`);
  }
}

// --- check and apply ----------------------------------------------------------

interface Checked {
  entry: WorksheetEntry;
  before: WorksheetEntry;
  changed: string[];
  problems: string[];
}

async function checkSheet(file: string, rows: ContentRows, lexicon: Lexicon): Promise<Checked[]> {
  if (!existsSync(file)) throw new Error(`No worksheet at ${file}`);
  const sheet = JSON.parse(await readFile(file, 'utf8')) as Worksheet;
  if (sheet.rubricVersion !== RUBRIC_VERSION) {
    throw new Error(`Worksheet uses rubric ${sheet.rubricVersion}; the current rubric is ${RUBRIC_VERSION}. Make a new one.`);
  }
  const ids = new Set(sheet.words.map((w) => w.wordId));
  if (ids.size !== sheet.words.length) throw new Error('A word appears twice in the worksheet');
  // Wrong answers must be unique across the whole word list, including the
  // other words in this worksheet.
  const owners = wrongAnswerOwners(rows, ids);
  const env: CheckEnv = { lexicon, takenWrongAnswers: owners };

  return sheet.words.map((entry) => {
    const word = rows.words.find((w) => w.id === entry.wordId);
    if (!word || word.headword !== entry.headword) {
      return { entry, before: entry, changed: [], problems: [`wordId ${entry.wordId} is not "${entry.headword}" in the record`] };
    }
    const before = buildEntry(rows, word);
    const changed = changedFields(before, entry);
    const problems = [...checkContent(entry, env), ...checkReview(entry, changed)];
    for (const wa of entry.wrongAnswers) owners.set(wa.meaning.trim().toLowerCase(), entry.wordId);
    return { entry, before, changed, problems };
  });
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

async function check(file: string): Promise<void> {
  const { rows } = await openRecord();
  const failing = report(await checkSheet(file, rows, await openLexicon()));
  console.log(failing ? `\n${failing} words fail. Fix them and check again.` : '\nAll words pass. Apply with: npx tsx src/curate.ts apply <worksheet>');
  if (failing) process.exitCode = 1;
}

async function apply(file: string): Promise<void> {
  const { store, rows } = await openRecord();
  const checked = await checkSheet(file, rows, await openLexicon());
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
      // The other senses belong to the old part of speech.
      await store.removeOtherSenses(word.id, primary.id);
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
    });
  }
  await store.flush();
  console.log(`\nApplied ${checked.length} words to ${DB_FILE}.`);

  // Export the app's words file from the updated record.
  const ctx = await createContext({ only: 'export', dryRun: false, limit: null, verbose: false });
  await ctx.store.init();
  await exportWords(ctx);
}

// --- main ---------------------------------------------------------------------

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const fileArg = args.find((a) => !a.startsWith('--'));
  if (command === 'status') return status();
  if (command === 'next') return next(args);
  if (command === 'check' && fileArg) return check(resolve(fileArg));
  if (command === 'apply' && fileArg) return apply(resolve(fileArg));
  console.log('Usage: npx tsx src/curate.ts <status | next [--count=N] [--words=a,b] | check <file> | apply <file>>');
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  process.stderr.write(`curate failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

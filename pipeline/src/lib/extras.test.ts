import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyExtrasEntry,
  buildExtrasEntry,
  checkExtras,
  checkExtrasReview,
  checkOrigin,
  checkPairings,
  checkRoots,
  checkWatchOut,
  currentExtrasReviews,
  EXTRAS_CRITERIA,
  EXTRAS_RUBRIC_VERSION,
  extrasCandidates,
  extrasChangedFields,
  foldText,
  sentenceCount,
  summarizeExtras,
  type ExtrasEntry,
} from './extras.ts';
import { currentReviews, mainReviews, RUBRIC_VERSION } from './curate.ts';
import { buildWordsFile, ETYMOLOGY_ATTRIBUTION, type ContentRows } from './exportContent.ts';
import { JsonFileStore } from './store.ts';
import { Logger } from './logger.ts';
import type { ReviewRow } from './types.ts';

// --- a small record -----------------------------------------------------------------

function rows(): ContentRows {
  const word = (id: number, headword: string, pos: string) => ({
    id, headword, part_of_speech: pos, ipa: null, syllables: 3, frequency_rank: id, difficulty_tier: 3, etymology: null, audio_url: null,
  });
  return {
    words: [word(1, 'insular', 'adjective'), word(2, 'prolific', 'adjective'), word(3, 'abate', 'verb')],
    senses: [
      { id: 10, word_id: 1, definition: 'Interested only in its own small group and wary of outsiders.', plain_language_definition: 'Caring only about your own small world.', sense_order: 1, register: null },
      { id: 11, word_id: 1, definition: 'Relating to or found on an island.', plain_language_definition: null, sense_order: 2, register: null },
      { id: 12, word_id: 1, definition: 'Relating to the insula of the brain.', plain_language_definition: null, sense_order: 3, register: null },
      { id: 20, word_id: 2, definition: 'Producing a great deal of work.', plain_language_definition: 'Making lots of things.', sense_order: 1, register: null },
      { id: 30, word_id: 3, definition: 'Become less strong.', plain_language_definition: 'To calm down.', sense_order: 1, register: null },
    ],
    example_sentences: [
      { id: 100, sense_id: 10, text: 'The insular village rarely welcomed strangers.', audio_url: null, cloze_target: 'insular', source: 'claude', is_generated: true },
    ],
    word_relations: [
      { id: 5, word_id: 1, related_lemma: 'parochial', relation_type: 'synonym', source: 'wordnet' },
      { id: 6, word_id: 1, related_lemma: 'cosmopolitan', relation_type: 'antonym', source: 'wordnet' },
    ],
    mnemonics: [{ id: 7, word_id: 1, text: 'Insular comes from Latin insula, an island: an insular group lives like one.', source: 'claude', user_id: null }],
    distractors: [],
  };
}

/** insular as an extras worksheet entry, filled in by a writer and a second reviewer. */
function goodEntry(): ExtrasEntry {
  const r = rows();
  const entry = buildExtrasEntry(r, r.words[0]!);
  return {
    ...entry,
    origin: 'From Latin insularis, from insula ("island"). A people cut off on an island came to stand for narrow views.',
    roots: ['insula'],
    register: 'disapproving',
    watchOut: null,
    pairings: ['insular community', 'insular world'],
    otherSenses: [
      { ...entry.otherSenses[0]!, plain: 'Having to do with islands.', alsoMeans: true },
      { ...entry.otherSenses[1]!, register: 'technical' },
    ],
    review: {
      scores: { origin: 5, hook: 5, tone: 4, watchOut: 4, pairings: 4, alsoMeans: 5 },
      verdict: 'fixed',
      notes: 'Origin checked against Wiktionary.',
    },
    checker: { scores: { origin: 5, hook: 4, tone: 4, watchOut: 5, pairings: 4, alsoMeans: 4 }, notes: '' },
  };
}

const before = (): ExtrasEntry => buildExtrasEntry(rows(), rows().words[0]!);
const problemsOf = (e: ExtrasEntry): string[] => checkExtras(e, before());

// --- entry building -----------------------------------------------------------------

test('buildExtrasEntry shows the main entry as context and the record extras as editable fields', () => {
  const e = before();
  assert.equal(e.headword, 'insular');
  assert.equal(e.definition, 'Interested only in its own small group and wary of outsiders.');
  assert.deepEqual(e.examples, ['The insular village rarely welcomed strangers.']);
  assert.deepEqual([e.synonyms, e.antonyms], [['parochial'], ['cosmopolitan']]);
  assert.equal(e.hook, 'Insular comes from Latin insula, an island: an insular group lives like one.');
  assert.deepEqual(
    { origin: e.origin, roots: e.roots, register: e.register, watchOut: e.watchOut, pairings: e.pairings },
    { origin: '', roots: [], register: null, watchOut: null, pairings: [] },
  );
  assert.deepEqual(
    e.otherSenses.map((s) => [s.senseId, s.plain, s.alsoMeans]),
    [
      [11, '', false],
      [12, '', false],
    ],
  );
  assert.deepEqual([e.review.scores, e.checker.scores], [null, null]);
});

test('buildExtrasEntry reads extras already in the record', () => {
  const r = rows();
  r.words[0] = { ...r.words[0]!, etymology: 'From Latin insula ("island").', roots: ['insula'], watch_out: 'A note.', pairings: ['insular world', 'insular views'] };
  r.senses = r.senses.map((s) => (s.id === 11 ? { ...s, plain_language_definition: 'Of islands.', also_means: true } : s));
  const e = buildExtrasEntry(r, r.words[0]!);
  assert.equal(e.origin, 'From Latin insula ("island").');
  assert.deepEqual(e.roots, ['insula']);
  assert.equal(e.watchOut, 'A note.');
  assert.deepEqual(e.otherSenses[0], { senseId: 11, definition: 'Relating to or found on an island.', plain: 'Of islands.', register: null, alsoMeans: true });
});

// --- content checks -----------------------------------------------------------------

test('a good extras entry passes the checks and the review rules', () => {
  const e = goodEntry();
  assert.deepEqual(problemsOf(e), []);
  const changed = extrasChangedFields(before(), e);
  assert.deepEqual(changed, ['origin', 'roots', 'register', 'pairings', 'otherSenses']);
  assert.deepEqual(checkExtrasReview(e, changed), []);
});

test('origin must be one or two plain sentences ending with a period', () => {
  assert.match(checkOrigin('')[0]!, /origin is empty/);
  assert.deepEqual(checkOrigin('Of unknown origin.'), []);
  assert.deepEqual(checkOrigin('From Latin prōlēs ("offspring"), c. 1650.'), []);
  assert.ok(checkOrigin('From Latin insula').some((p) => p.includes('end with a period')));
  assert.ok(checkOrigin('from Latin insula.').some((p) => p.includes('start with a capital')));
  assert.ok(checkOrigin('One. Two. Three.').some((p) => p.includes('one or two sentences (has 3)')));
  assert.ok(checkOrigin(`From Latin ${'x'.repeat(220)}.`).some((p) => p.includes('at most 220 characters')));
  assert.ok(checkOrigin('From Latin insula \u2014 an island.').includes('origin contains an em dash'));
  assert.ok(checkOrigin('From Latin insula [island].').some((p) => p.includes('brackets')));
  assert.ok(checkOrigin('From Latin insula. See https://en.wiktionary.org/wiki/insular.').some((p) => p.includes('URL')));
  assert.ok(checkOrigin(`From Latin insula${String.fromCharCode(0x200b)}.`).some((p) => p.includes('invisible')));
});

test('sentenceCount ignores abbreviations followed by a lowercase word or a number', () => {
  assert.equal(sentenceCount('From Latin prolificus, c. 1650, from proles.'), 1);
  assert.equal(sentenceCount('From Latin. It meant offspring.'), 2);
});

test('roots must be stems named in the origin, compared without case or diacritics', () => {
  assert.deepEqual(checkRoots(['proles'], 'From Latin Prōlēs ("offspring").'), []);
  assert.equal(foldText('Prōlēs Æther'), 'proles aether');
  const p = checkRoots(['Proles', 'ex', 'pro', 'facere', 'proles', 'proles'], 'From Latin proles and insula.');
  assert.ok(p.some((x) => x.includes('at most 3 roots')));
  assert.ok(p.some((x) => x.includes('"Proles" must be lowercase ASCII')));
  assert.ok(p.some((x) => x.includes('"ex" is too short')));
  assert.ok(p.some((x) => x.includes('"pro" is a bare prefix or suffix')));
  assert.ok(p.some((x) => x.includes('"facere" does not appear in origin')));
  assert.ok(p.some((x) => x.includes('"proles" is listed twice')));
  // A root inside a longer word is not named on its own.
  assert.ok(checkRoots(['cilium'], 'From Latin supercilium.').some((x) => x.includes('does not appear')));
  assert.ok(checkRoots(['prōles'], 'From Latin prōles.').some((x) => x.includes('lowercase ASCII')));
});

test('register must be null or one of the fixed list, on every sense', () => {
  const e = goodEntry();
  e.register = 'snobbish';
  e.otherSenses[1]!.register = 'Formal';
  const p = problemsOf(e);
  assert.ok(p.some((x) => x.startsWith('register "snobbish" must be null or one of formal, informal')));
  assert.ok(p.some((x) => x.includes('register "Formal" must be null')));
});

test('watchOut is null or one short sentence ending with a period', () => {
  assert.deepEqual(checkWatchOut(null), []);
  assert.deepEqual(checkWatchOut('Enervate does not mean energize; it means to drain energy.'), []);
  assert.match(checkWatchOut('  ')[0]!, /use null/);
  assert.ok(checkWatchOut('It does not mean energize').some((p) => p.includes('end with a period')));
  assert.ok(checkWatchOut(`It ${'x'.repeat(160)}.`).some((p) => p.includes('at most 160 characters')));
  assert.ok(checkWatchOut('It drains \u2014 not energizes.').includes('watchOut contains an em dash'));
});

test('pairings are 2 to 4 lowercase phrases of 2 to 4 words that use the word', () => {
  assert.deepEqual(checkPairings([], 'abate'), []);
  assert.deepEqual(checkPairings(['tensions abate', 'the storm abated', 'abate a nuisance'], 'abate'), []);
  assert.deepEqual(checkPairings(['a Senate abated', 'fears abate'], 'abate'), [], 'a proper noun after the first word is fine');
  assert.ok(checkPairings(['tensions abate'], 'abate').some((p) => p.includes('need 2 to 4 pairings')));
  assert.ok(checkPairings(['a', 'b', 'c', 'd', 'e'].map((x) => `${x} abate`), 'abate').some((p) => p.includes('need 2 to 4')));
  const p = checkPairings(
    ['abate', 'the long cold winter storm abated', 'tensions ease', 'Tensions abate', 'fears Abate', 'tensions abate.', 'TENSIONS abate', 'fears abate', 'fears  abate'],
    'abate',
  );
  assert.ok(p.some((x) => x.includes('"abate" must be 2 to 4 words (has 1)')));
  assert.ok(p.some((x) => x.includes('"the long cold winter storm abated" must be 2 to 4 words')));
  assert.ok(p.some((x) => x.includes('"tensions ease" does not use the word')));
  assert.ok(p.some((x) => x.includes('"Tensions abate" must be lowercase')));
  assert.ok(p.some((x) => x.includes('"fears Abate" must be lowercase')));
  assert.ok(p.some((x) => x.includes('"TENSIONS abate" must be lowercase')));
  assert.ok(p.some((x) => x.includes('"tensions abate." must be words only')));
  assert.ok(p.some((x) => x.includes('"fears  abate" has extra spaces')));
  assert.ok(checkPairings(['fears abate', 'fears abate'], 'abate').some((x) => x.includes('listed twice')));
});

test('an Also means sense needs a short plain definition that does not name the word', () => {
  const e = goodEntry();
  e.otherSenses[0]!.plain = '';
  assert.ok(problemsOf(e).some((p) => p.includes('is shown under Also means, so it needs a plain definition')));
  e.otherSenses[0]!.plain = 'Having to do with insular places such as islands.';
  assert.ok(problemsOf(e).some((p) => p.includes('plain names the word')));
  e.otherSenses[0]!.plain = `Having to do with islands ${'and seas '.repeat(10)}.`;
  assert.ok(problemsOf(e).some((p) => p.includes('at most 20 words')));
  e.otherSenses[0]!.plain = 'having to do with islands';
  assert.ok(problemsOf(e).some((p) => p.includes('capitalized sentence ending with a period')));
  e.otherSenses[0]!.plain = 'Caring only about your own small world.';
  assert.ok(problemsOf(e).some((p) => p.includes('repeats the first sense')));
});

test('at most 2 other senses are shown under Also means', () => {
  const r = rows();
  r.senses.push({ id: 13, word_id: 1, definition: 'Of an isolated area.', plain_language_definition: null, sense_order: 4, register: null });
  const b = buildExtrasEntry(r, r.words[0]!);
  const e: ExtrasEntry = {
    ...goodEntry(),
    otherSenses: b.otherSenses.map((s, i) => ({ ...s, plain: `Having to do with place number ${i + 1}.`, alsoMeans: true })),
  };
  assert.ok(checkExtras(e, b).some((p) => p.includes('at most 2 other senses may be shown under Also means (has 3)')));
});

test('an other sense keeps its definition, and the sense list must match the record', () => {
  const e = goodEntry();
  e.otherSenses[1]!.definition = 'Relating to a part of the brain.';
  assert.ok(problemsOf(e).some((p) => p.includes('definition is read-only here')));
  const dropped = goodEntry();
  dropped.otherSenses.pop();
  assert.ok(problemsOf(dropped).some((p) => p.includes('must list the same senses as the record')));
});

test('read-only context cannot be changed on an extras worksheet', () => {
  const e = goodEntry();
  e.definition = 'Narrow-minded.';
  e.examples = [];
  const p = problemsOf(e);
  assert.ok(p.some((x) => x.startsWith('definition is read-only')));
  assert.ok(p.some((x) => x.startsWith('examples is read-only')));
});

test('a changed hook gets the main hook checks; an unchanged one is left alone', () => {
  const e = goodEntry();
  e.hook = 'An island.';
  const p = problemsOf(e);
  assert.ok(p.includes('hook must be 20 to 240 characters'));
  assert.ok(p.includes('hook must name the word'));
  e.hook = 'Insular comes from Latin insula \u2014 an island.';
  assert.ok(problemsOf(e).includes('hook contains an em dash'));
  assert.ok(!problemsOf(goodEntry()).some((x) => x.startsWith('hook')));
});

test('wrong types in a hand-edited entry are reported before anything else', () => {
  const e = goodEntry() as unknown as Record<string, unknown>;
  e.roots = 'insula';
  e.otherSenses = [{ senseId: 11 }];
  const p = checkExtras(e as unknown as ExtrasEntry, before());
  assert.deepEqual(p, [
    'roots must be a list of strings',
    'otherSenses[0] must have senseId, definition, plain (a string), register (a string or null) and alsoMeans (true or false)',
  ]);
});

test('the extras review needs every extras criterion, with the main verdict rules', () => {
  const e = goodEntry();
  e.review.scores = { origin: 5, hook: 5 };
  assert.ok(checkExtrasReview(e, ['origin']).some((p) => p.includes('review.scores.tone is missing')));
  const low = goodEntry();
  low.checker.scores!.pairings = 3;
  low.checker.notes = 'Pairings are invented.';
  assert.ok(checkExtrasReview(low, ['origin']).some((p) => p.includes('second reviewer scored pairings under 4')));
  const pass = goodEntry();
  pass.review.verdict = 'pass';
  assert.ok(checkExtrasReview(pass, ['origin']).some((p) => p.includes('use "fixed"')));
  // Main criteria do not apply here.
  assert.ok(!checkExtrasReview(goodEntry(), ['origin']).some((p) => p.includes('wrongAnswers')));
  assert.deepEqual([...EXTRAS_CRITERIA], ['origin', 'hook', 'tone', 'watchOut', 'pairings', 'alsoMeans']);
});

// --- rubric separation --------------------------------------------------------------

function review(id: number, wordId: number, rubric: 'main' | 'extras' | undefined, version = 1): ReviewRow {
  return {
    id,
    word_id: wordId,
    ...(rubric ? { rubric } : {}),
    rubric_version: version,
    reviewed_at: '2026-10-29',
    scores: {},
    verdict: 'pass',
    changed: [],
    notes: `review ${id}`,
  };
}

test('main readers ignore extras reviews, and extras readers ignore main reviews', () => {
  const reviews = [
    review(1, 1, undefined), // main, written before extras existed
    review(2, 2, 'main'),
    review(3, 1, 'extras'),
    review(4, 3, 'extras'),
    review(5, 2, 'extras', EXTRAS_RUBRIC_VERSION + 1), // a later extras rubric
  ];
  assert.equal(RUBRIC_VERSION, EXTRAS_RUBRIC_VERSION, 'same version numbers, so only the rubric field tells them apart');
  assert.deepEqual(mainReviews(reviews).map((r) => r.id), [1, 2]);
  const main = currentReviews(reviews);
  assert.deepEqual([...main.keys()].sort(), [1, 2]);
  assert.equal(main.get(1)!.id, 1, 'the newer extras review of word 1 does not replace its main review');
  assert.equal(main.has(3), false, 'a word with only an extras review is unreviewed on the main rubric');

  const extras = currentExtrasReviews(reviews);
  assert.deepEqual([...extras.keys()].sort(), [1, 3]);
  assert.equal(extras.has(2), false, 'a main review does not count as an extras review');

  // extras next picks words with no extras review, in record order.
  assert.deepEqual(extrasCandidates(rows(), reviews).map((w) => w.headword), ['prolific']);
  assert.deepEqual(extrasCandidates(rows(), [review(1, 1, undefined)]).map((w) => w.headword), ['insular', 'prolific', 'abate']);
});

// --- apply round trip ----------------------------------------------------------------

function recordFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'extras-test-'));
  const file = join(dir, 'db.json');
  const r = rows();
  writeFileSync(
    file,
    JSON.stringify({
      meta: { note: '', createdAt: '', updatedAt: '' },
      counters: { mnemonics: 7, reviews: 1 },
      ...r,
      audio_objects: [],
      reviews: [review(1, 1, undefined)],
    }),
  );
  return file;
}

test('apply writes the extras to the record, and the export carries them', async () => {
  const file = recordFile();
  const store = new JsonFileStore(file, tmpdir(), false, new Logger(false));
  await store.init();
  const snapshot = await store.snapshot();
  const entry = goodEntry();
  entry.watchOut = 'Insular is about narrow views, not about being shy.';
  entry.hook = 'Insular holds insula, Latin for island: an insular group lives like one.';
  const changed = extrasChangedFields(buildExtrasEntry(snapshot, snapshot.words[0]!), entry);
  assert.ok(changed.includes('hook') && changed.includes('watchOut'));
  await applyExtrasEntry(store, snapshot, entry, changed, '2026-10-29');
  await store.flush();

  // Read it back from disk.
  const reread = new JsonFileStore(file, tmpdir(), false, new Logger(false));
  await reread.init();
  const after = await reread.snapshot();
  const insular = after.words[0]!;
  assert.equal(insular.etymology, entry.origin);
  assert.deepEqual(insular.roots, ['insula']);
  assert.equal(insular.watch_out, 'Insular is about narrow views, not about being shy.');
  assert.deepEqual(insular.pairings, ['insular community', 'insular world']);
  const senses = after.senses.filter((s) => s.word_id === 1).sort((a, b) => a.sense_order - b.sense_order);
  assert.deepEqual(
    senses.map((s) => [s.id, s.definition.slice(0, 20), s.plain_language_definition, s.register, s.also_means]),
    [
      [10, 'Interested only in i', 'Caring only about your own small world.', 'disapproving', undefined],
      [11, 'Relating to or found', 'Having to do with islands.', null, true],
      [12, 'Relating to the insu', null, 'technical', false],
    ],
  );
  const hooks = after.mnemonics.filter((m) => m.word_id === 1 && m.user_id === null);
  assert.deepEqual(hooks.map((m) => [m.text, m.revision]), [[entry.hook, 3]]);

  // The record now reads back as the entry that was applied.
  const rebuilt = buildExtrasEntry(after, insular);
  assert.deepEqual(extrasChangedFields(rebuilt, entry), []);

  // The review is an extras review, invisible to the main rubric.
  const reviews = await reread.listReviews();
  const added = reviews.at(-1)!;
  assert.equal(added.rubric, 'extras');
  assert.equal(added.rubric_version, EXTRAS_RUBRIC_VERSION);
  assert.deepEqual(added.scores, entry.review.scores);
  assert.deepEqual(added.checker_scores, entry.checker.scores);
  assert.deepEqual(added.changed, changed);
  assert.equal(currentReviews(reviews).get(1)!.id, 1);
  assert.equal(currentExtrasReviews(reviews).get(1)!.id, added.id);

  // And the export shows it.
  const { file: words } = buildWordsFile(after, ['credit']);
  const exported = words.words.find((w) => w.headword === 'insular')!;
  assert.equal(exported.etymology, entry.origin);
  assert.deepEqual(exported.roots, ['insula']);
  assert.equal(exported.watchOut, entry.watchOut);
  assert.deepEqual(exported.pairings, entry.pairings);
  assert.deepEqual(exported.senses.map((s) => s.alsoMeans), [false, true, false]);
  assert.deepEqual(exported.senses.map((s) => s.register), ['disapproving', null, 'technical']);
  assert.deepEqual(exported.mnemonics, [entry.hook]);
  assert.deepEqual(words.attribution, ['credit', ETYMOLOGY_ATTRIBUTION]);

  // extras status counts it.
  const summary = summarizeExtras(after, reviews);
  assert.equal(summary.reviewed, 1);
  assert.deepEqual(summary.verdicts, { pass: 0, fixed: 1, flagged: 0 });
  assert.deepEqual(
    [summary.withOrigin, summary.withRoots, summary.withWatchOut, summary.withPairings, summary.alsoMeansSenses],
    [1, 1, 1, 1, 1],
  );
  assert.deepEqual(summary.registers, { disapproving: 1, technical: 1 });
  assert.deepEqual(summary.sharedRoots, []);
  assert.equal(summary.loneRoots, 1);
});

test('summarizeExtras lists roots shared by two or more words', () => {
  const r = rows();
  r.words[1] = { ...r.words[1]!, roots: ['proles'] };
  r.words.push({ ...r.words[1]!, id: 4, headword: 'proliferate', roots: ['proles', 'ferre'] });
  const s = summarizeExtras(r, []);
  assert.deepEqual(s.sharedRoots, [{ root: 'proles', headwords: ['prolific', 'proliferate'] }]);
  assert.equal(s.loneRoots, 1);
});

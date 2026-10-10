import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  namesWord,
  buildEntry,
  changedFields,
  checkContent,
  checkReview,
  problemKind,
  splitIntoParts,
  wrongAnswerOwners,
  type CheckEnv,
  type WorksheetEntry,
} from './curate.ts';
import type { ContentRows } from './exportContent.ts';

const lexicon = (w: string): string[] | null =>
  ({
    abet: ['verb'],
    abdicate: ['verb'],
    abase: ['verb'],
    abrade: ['verb'],
    abeyance: ['noun'],
    lessen: ['verb'],
    subside: ['verb'],
    intensify: ['verb'],
  })[w] ?? null;

const env = (taken: [string, number][] = []): CheckEnv => ({
  lexicon,
  takenWrongAnswers: new Map(taken),
});

function goodEntry(): WorksheetEntry {
  return {
    wordId: 1,
    headword: 'abate',
    tier: 3,
    otherSenses: [],
    partOfSpeech: 'verb',
    definition: 'Make less active or intense.',
    plain: 'To make something weaker or less strong.',
    examples: [
      { text: 'The medicine helped abate the fever by morning.', cloze: 'abate' },
      { text: 'Once the storm abated, the ferries started running again.', cloze: 'abated' },
      { text: 'Nothing the mayor said could abate the public anger.', cloze: 'abate' },
    ],
    wrongAnswers: [
      { lookalike: 'abet', meaning: 'Help or encourage someone to do wrong.' },
      { lookalike: 'abdicate', meaning: 'Give up a throne or high office.' },
      { lookalike: 'abase', meaning: 'Lower someone in rank or dignity.' },
      { lookalike: 'abrade', meaning: 'Wear away by rubbing.' },
    ],
    hook: 'Abate sounds like "a bit": the storm calms down a bit at a time.',
    synonyms: ['lessen', 'subside'],
    antonyms: ['intensify'],
    review: {
      scores: { sense: 5, definition: 4, plain: 5, examples: 5, wrongAnswers: 5, hook: 4, related: 4 },
      verdict: 'fixed',
      notes: '',
    },
    checker: {
      scores: { sense: 5, definition: 5, plain: 4, examples: 4, wrongAnswers: 5, hook: 4, related: 4 },
      notes: '',
    },
  };
}

test('a good entry passes the content checks', () => {
  assert.deepEqual(checkContent(goodEntry(), env()), []);
});

test('a plain definition that names the word is a giveaway', () => {
  const e = { ...goodEntry(), plain: 'To abate is to make something weaker.' };
  assert.ok(checkContent(e, env()).some((p) => p.includes('gives away')));
});

test('examples must be full sentences that use the word, with the cloze as written', () => {
  const e = goodEntry();
  e.examples[0] = { text: 'A capricious breeze', cloze: 'capricious' };
  e.examples[1] = { text: 'Once the storm abated, the ferries started running again.', cloze: 'abate' };
  const problems = checkContent(e, env());
  assert.ok(problems.some((p) => p.includes('capitalized sentence with end punctuation')));
  assert.ok(problems.some((p) => p.includes('does not use the word')));
  assert.ok(problems.some((p) => p.includes('cloze must be "abated"')));
});

test('wrong answers need real look-alikes with the same part of speech', () => {
  const e = goodEntry();
  e.wrongAnswers[0] = { lookalike: '', meaning: 'Help or encourage someone to do wrong.' };
  e.wrongAnswers[1] = { lookalike: 'abeyance', meaning: 'A state of temporary disuse.' };
  e.wrongAnswers[2] = { lookalike: 'abatement', meaning: 'Lower someone in rank or dignity.' };
  const problems = checkContent(e, env());
  assert.ok(problems.some((p) => p.includes('has no lookalike word')));
  assert.ok(problems.some((p) => p.includes('"abeyance" is a noun, not a verb')));
  assert.ok(problems.some((p) => p.includes('"abatement" is the word itself') || p.includes('not in WordNet')));
});

test('a wrong answer used by another word is rejected', () => {
  const problems = checkContent(goodEntry(), env([['wear away by rubbing.', 7]]));
  assert.ok(problems.some((p) => p.includes('already used by word 7')));
});

test('the hook must name the word, and related words must be real', () => {
  const e = { ...goodEntry(), hook: 'Think of a storm that slowly calms down.', synonyms: ['lessen', 'Unwordly'] };
  const problems = checkContent(e, env());
  assert.ok(problems.includes('hook must name the word'));
  assert.ok(problems.some((p) => p.includes('"Unwordly" must be lowercase')));
  assert.ok(problems.some((p) => p.includes('not in WordNet')));
});

test('an em dash anywhere in the content fails, but not in review notes', () => {
  const dash = { ...goodEntry(), hook: 'Abate — a bit less, bit by bit.' };
  assert.ok(checkContent(dash, env()).includes('contains an em dash'));
  const inNotes = goodEntry();
  inNotes.review.notes = 'Fine — no notes.';
  assert.deepEqual(checkContent(inNotes, env()), []);
});

test('markup, code symbols and invisible characters in the content fail', () => {
  const bom = String.fromCharCode(0xfeff);
  const junk = { ...goodEntry(), hook: `Abate sounds like "a bit".}]}\`\`\`[instruction]@@${bom}{` };
  assert.ok(checkContent(junk, env()).some((p) => p.includes('contains markup')));
  const hidden = goodEntry();
  hidden.wrongAnswers[0] = { lookalike: 'abet', meaning: `Help or encourage${String.fromCharCode(0x200b)} someone to do wrong.` };
  assert.ok(checkContent(hidden, env()).some((p) => p.includes('invisible characters')));
  // Ordinary punctuation, quotes and accented letters are fine.
  const fine = { ...goodEntry(), hook: 'Abate sounds like "a bit" (as in a caf\u00e9 that empties a bit at a time).' };
  assert.deepEqual(checkContent(fine, env()), []);
});

test('splitIntoParts makes near-equal runs in order', () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  assert.deepEqual(splitIntoParts(items, 3), [[0, 1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  assert.deepEqual(splitIntoParts(items, 1), [items]);
  assert.deepEqual(splitIntoParts([1, 2], 5), [[1], [2]]);
});

test('the review needs every score, and a verdict that matches the scores and changes', () => {
  assert.deepEqual(checkReview(goodEntry(), ['hook']), []);

  const missing = goodEntry();
  missing.review.scores = { sense: 5 };
  assert.ok(checkReview(missing, ['hook']).some((p) => p.includes('review.scores.plain is missing')));

  const low = goodEntry();
  low.review.scores!.hook = 2;
  assert.ok(checkReview(low, ['hook']).some((p) => p.includes('low: hook')));
  low.review.verdict = 'flagged';
  assert.ok(checkReview(low, ['hook']).some((p) => p.includes('needs notes')));
  low.review.notes = 'No good sound-alike exists for this word.';
  assert.deepEqual(checkReview(low, ['hook']), []);

  const pass = goodEntry();
  pass.review.verdict = 'pass';
  assert.ok(checkReview(pass, ['hook']).some((p) => p.includes('use "fixed"')));
  assert.ok(checkReview(goodEntry(), []).some((p) => p.includes('use "pass"')));
});

test('changedFields lists only content fields that differ', () => {
  const before = goodEntry();
  const after = { ...goodEntry(), hook: 'Different hook naming abate clearly.' };
  after.review.notes = 'changed';
  assert.deepEqual(changedFields(before, after), ['hook']);
});

test('problemKind strips quoted text and numbers', () => {
  assert.equal(problemKind('wrong answer "Foo." is already used by word 12'), 'wrong answer … is already used by word N');
});

// --- reading the record -------------------------------------------------------

function rows(): ContentRows {
  return {
    words: [
      { id: 1, headword: 'abate', part_of_speech: 'verb', ipa: null, syllables: 2, frequency_rank: 1, difficulty_tier: 3, etymology: null, audio_url: null },
      { id: 2, headword: 'abet', part_of_speech: 'verb', ipa: null, syllables: 2, frequency_rank: 2, difficulty_tier: 4, etymology: null, audio_url: null },
    ],
    senses: [
      { id: 11, word_id: 1, definition: 'Become less in amount.', plain_language_definition: null, sense_order: 2, register: null },
      { id: 10, word_id: 1, definition: 'Make less active or intense.', plain_language_definition: 'Make weaker.', sense_order: 1, register: null },
      { id: 20, word_id: 2, definition: 'Assist wrongdoing.', plain_language_definition: null, sense_order: 1, register: null },
    ],
    example_sentences: [
      { id: 100, sense_id: 10, text: 'The storm abated', audio_url: null, cloze_target: 'abated', source: 'wordnet', is_generated: false },
      { id: 101, sense_id: 10, text: 'Nothing could abate her anger.', audio_url: null, cloze_target: 'abate', source: 'gemini', is_generated: true },
    ],
    word_relations: [
      { id: 5, word_id: 1, related_lemma: 'lessen', relation_type: 'synonym', source: 'wordnet' },
      { id: 6, word_id: 1, related_lemma: 'intensify', relation_type: 'antonym', source: 'wordnet' },
    ],
    mnemonics: [
      { id: 7, word_id: 1, text: 'Old hook.', source: 'gemini', user_id: null },
      { id: 8, word_id: 1, text: 'Newer hook about abate.', source: 'gemini', user_id: null, revision: 2 },
      { id: 9, word_id: 1, text: 'Personal hook.', source: 'gemini', user_id: 'u1' },
    ],
    distractors: [
      { id: 30, sense_id: 10, distractor_lemma: 'Help a crime along.', kind: 'mc', difficulty: 3, source: 'gemini', lookalike: 'abet' },
      { id: 31, sense_id: 11, distractor_lemma: 'Not shown.', kind: 'mc', difficulty: 3, source: 'gemini' },
      { id: 32, sense_id: 20, distractor_lemma: 'Make less intense.', kind: 'mc', difficulty: 4, source: 'gemini' },
    ],
  };
}

test('buildEntry reads the first sense, generated examples first, and the newest global hook', () => {
  const e = buildEntry(rows(), rows().words[0]!);
  assert.equal(e.definition, 'Make less active or intense.');
  assert.deepEqual(e.otherSenses, ['Become less in amount.']);
  assert.deepEqual(e.examples.map((x) => x.text), ['Nothing could abate her anger.', 'The storm abated']);
  assert.deepEqual(e.wrongAnswers, [{ lookalike: 'abet', meaning: 'Help a crime along.' }]);
  assert.equal(e.hook, 'Newer hook about abate.');
  assert.deepEqual(e.synonyms, ['lessen']);
  assert.deepEqual(e.antonyms, ['intensify']);
});

test('wrongAnswerOwners covers first senses only and skips the given words', () => {
  const owners = wrongAnswerOwners(rows(), new Set([2]));
  assert.deepEqual([...owners.entries()], [['help a crime along.', 1]]);
});

test('other senses must be clean sentences that do not repeat a sense or name the word', () => {
  const e = goodEntry();
  e.otherSenses = ['Become less in amount or intensity.', 'Make less active or intense.', 'To abate a tax.'];
  const problems = checkContent(e, env());
  assert.ok(problems.some((p) => p.includes('"Make less active or intense." repeats another sense')));
  assert.ok(problems.some((p) => p.includes('"To abate a tax." names the word')));
  assert.ok(!problems.some((p) => p.includes('Become less in amount')));
});

test('a wrong answer may not name its own look-alike', () => {
  const e = goodEntry();
  e.wrongAnswers[0] = { lookalike: 'abet', meaning: 'Help a thief, as when you abet a robbery.' };
  const problems = checkContent(e, env());
  assert.ok(problems.some((p) => p.includes('names its lookalike "abet"')));
  assert.ok(!checkContent(goodEntry(), env()).some((p) => p.includes('names its lookalike')));
});

test('wrong answers must start the way the definition does, with or without "To"', () => {
  const e = goodEntry();
  e.wrongAnswers[1] = { lookalike: 'abdicate', meaning: 'To give up a throne or high office.' };
  const problems = checkContent(e, env());
  assert.ok(problems.some((p) => p.includes('"To give up a throne') && p.includes('start the way the definition does')));
  assert.ok(!checkContent(goodEntry(), env()).some((p) => p.includes('start the way the definition does')));
});

test('the second reviewer must score every criterion, and its low scores block the verdict', () => {
  const missing = goodEntry();
  missing.checker.scores = null;
  assert.deepEqual(checkReview(missing, ['hook']), ['checker.scores is not filled in']);

  const low = goodEntry();
  low.checker.scores!.examples = 3;
  low.checker.notes = 'Second example is generic.';
  assert.ok(checkReview(low, ['hook']).some((p) => p.includes('second reviewer scored examples under 4 (Second example is generic.)')));

  low.review.verdict = 'flagged';
  low.review.notes = 'Could not find a less generic example in time.';
  assert.deepEqual(checkReview(low, ['hook']), []);
});

test('namesWord catches inflections and words built on the headword, not look-alikes', () => {
  assert.equal(namesWord('Aesthetically pleasing.', 'aesthetic'), true);
  assert.equal(namesWord('A call for abatement of the tax.', 'abate'), true);
  assert.equal(namesWord('The storm abated.', 'abate'), true);
  assert.equal(namesWord('Help or encourage someone to do wrong.', 'abate'), false);
  assert.equal(namesWord('Practicing strict self-denial.', 'aesthetic'), false);
});

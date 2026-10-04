import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRevisePrompt, parseRevisedBatch, type ReviseItem } from './revise.ts';

const abate: ReviseItem = {
  senseId: 11,
  headword: 'abate',
  partOfSpeech: 'verb',
  definition: 'Make less active or intense.',
  plainDefinition: 'To reduce the strength of something.',
  needsMnemonic: true,
};

const goodDistractors = [
  { word: 'abet', meaning: 'Encourage or assist someone to do wrong.' },
  { word: 'abdicate', meaning: 'Give up a throne or high office formally.' },
  { word: 'abase', meaning: 'Lower in rank, dignity or esteem.' },
  { word: 'abrade', meaning: 'Wear away by rubbing.' },
];

function batch(...items: unknown[]): string {
  return JSON.stringify({ items });
}

test('buildRevisePrompt gives the model both definitions and the mnemonic request', () => {
  const prompt = buildRevisePrompt(abate);
  assert.match(prompt, /Sense id: 11/);
  assert.match(prompt, /Dictionary definition: Make less active or intense\./);
  assert.match(prompt, /Plain definition: To reduce/);
  assert.match(prompt, /Include a mnemonic\./);
  assert.match(buildRevisePrompt({ ...abate, needsMnemonic: false }), /Set "mnemonic" to null/);
});

test('a good item is kept and its wrong answers are reserved', () => {
  const taken = new Set<string>();
  const out = parseRevisedBatch(
    batch({ sense_id: 11, distractors: goodDistractors, mnemonic: 'To abate is to make a storm "a bit" weaker.' }),
    [abate],
    taken,
  );
  assert.deepEqual(out.failed, []);
  assert.equal(out.valid.get(11)!.distractors.length, 4);
  assert.ok(taken.has('wear away by rubbing.'));
});

test('a hook may split the word up but must name it', () => {
  const ok = parseRevisedBatch(
    batch({ sense_id: 11, distractors: goodDistractors, mnemonic: 'A-BATE: the wind bates its breath.' }),
    [abate],
    new Set(),
  );
  assert.deepEqual(ok.failed, []);
  const bad = parseRevisedBatch(
    batch({ sense_id: 11, distractors: goodDistractors, mnemonic: 'Think of a storm that calms down.' }),
    [abate],
    new Set(),
  );
  assert.deepEqual(bad.failed, [11]);
  assert.match(bad.errors[0]!, /does not name the word/);
});

test('each rule rejects the item', () => {
  const cases: [string, unknown][] = [
    ['look-alike is the target', [{ word: 'abated', meaning: 'Became less strong.' }, ...goodDistractors.slice(1)]],
    ['look-alike used twice', [goodDistractors[0], { ...goodDistractors[0], meaning: 'Help a crime along.' }, ...goodDistractors.slice(2)]],
    ['not a capitalized sentence', [{ word: 'abet', meaning: 'encourage wrongdoing' }, ...goodDistractors.slice(1)]],
    ['mentions the target', [{ word: 'abet', meaning: 'To abate a crime by helping.' }, ...goodDistractors.slice(1)]],
    ['is the correct definition', [{ word: 'lessen', meaning: 'Make less active or intense.' }, ...goodDistractors.slice(1)]],
    ['em dash', [{ word: 'abet', meaning: 'Encourage \u2014 or assist.' }, ...goodDistractors.slice(1)]],
  ];
  for (const [label, distractors] of cases) {
    const out = parseRevisedBatch(
      batch({ sense_id: 11, distractors, mnemonic: 'Abate: make it a bit less.' }),
      [abate],
      new Set(),
    );
    assert.deepEqual(out.failed, [11], label);
  }
});

test('a wrong answer already used for another word is rejected', () => {
  const taken = new Set(['wear away by rubbing.']);
  const out = parseRevisedBatch(
    batch({ sense_id: 11, distractors: goodDistractors, mnemonic: 'Abate: a bit less.' }),
    [abate],
    taken,
  );
  assert.deepEqual(out.failed, [11]);
  assert.match(out.errors[0]!, /already used for another word/);
});

test('unexpected ids, bad JSON and missing items all fail cleanly', () => {
  assert.deepEqual(parseRevisedBatch('nope', [abate], new Set()).failed, [11]);
  const stray = parseRevisedBatch(
    batch({ sense_id: 99, distractors: goodDistractors, mnemonic: 'Abate: a bit less.' }),
    [abate],
    new Set(),
  );
  assert.deepEqual(stray.failed, [11]);
  assert.match(stray.errors[0]!, /unexpected sense_id 99/);
});

test('with a dictionary, look-alikes must be real words with the target part of speech', () => {
  const lexicon = (w: string): string[] | null =>
    ({ abet: ['verb'], abdicate: ['verb'], abase: ['verb'], abrade: ['verb'], abeyance: ['noun'] })[w] ?? null;
  const ok = parseRevisedBatch(
    batch({ sense_id: 11, distractors: goodDistractors, mnemonic: 'Abate: a bit less.' }),
    [abate],
    new Set(),
    lexicon,
  );
  assert.deepEqual(ok.failed, []);

  const noun = parseRevisedBatch(
    batch({
      sense_id: 11,
      distractors: [...goodDistractors.slice(0, 3), { word: 'abeyance', meaning: 'A state of temporary disuse.' }],
      mnemonic: 'Abate: a bit less.',
    }),
    [abate],
    new Set(),
    lexicon,
  );
  assert.match(noun.errors[0]!, /"abeyance" is a noun, not a verb/);

  const unknown = parseRevisedBatch(
    batch({
      sense_id: 11,
      distractors: [...goodDistractors.slice(0, 3), { word: 'abets', meaning: 'Helps a crime along.' }],
      mnemonic: 'Abate: a bit less.',
    }),
    [abate],
    new Set(),
    lexicon,
  );
  assert.match(unknown.errors[0]!, /"abets" is not in the dictionary/);
});

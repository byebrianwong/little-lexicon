import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWordsFile, checkIdStability, type ContentRows } from './exportContent.ts';

function rows(): ContentRows {
  return {
    words: [
      {
        id: 2,
        headword: 'laconic',
        part_of_speech: 'adjective',
        ipa: '/ləˈkɑnɪk/',
        syllables: 3,
        frequency_rank: 900,
        difficulty_tier: 3,
        etymology: null,
        audio_url: null,
      },
      {
        id: 1,
        headword: 'abate',
        part_of_speech: 'verb',
        ipa: null,
        syllables: 2,
        frequency_rank: 500,
        difficulty_tier: 2,
        etymology: null,
        audio_url: null,
      },
      {
        id: 3,
        headword: 'nosense',
        part_of_speech: null,
        ipa: null,
        syllables: 2,
        frequency_rank: null,
        difficulty_tier: 5,
        etymology: null,
        audio_url: null,
      },
    ],
    senses: [
      { id: 10, word_id: 2, definition: 'Brief.', plain_language_definition: 'Short.', sense_order: 1, register: null },
      { id: 11, word_id: 1, definition: 'Lessen.', plain_language_definition: null, sense_order: 1, register: null },
    ],
    example_sentences: [
      { id: 100, sense_id: 10, text: 'A laconic reply', audio_url: null, cloze_target: 'laconic', source: 'wordnet', is_generated: false },
      { id: 101, sense_id: 10, text: 'Her laconic note said enough.', audio_url: null, cloze_target: 'laconic', source: 'claude', is_generated: true },
    ],
    word_relations: [
      { id: 5, word_id: 2, related_lemma: 'terse', relation_type: 'synonym', source: 'wordnet' },
    ],
    mnemonics: [
      { id: 7, word_id: 2, text: 'Global aid.', source: 'claude', user_id: null },
      { id: 8, word_id: 2, text: 'Personal aid.', source: 'claude', user_id: 'user-1' },
    ],
    distractors: [
      { id: 9, sense_id: 10, distractor_lemma: 'Very loud.', kind: 'mc', difficulty: 3, source: 'claude' },
    ],
  };
}

test('buildWordsFile orders words by id and holds back words with no senses', () => {
  const { file, heldBack } = buildWordsFile(rows(), ['credit']);
  assert.deepEqual(file.words.map((w) => w.headword), ['abate', 'laconic']);
  assert.deepEqual(heldBack, [{ headword: 'nosense', reason: 'no senses' }]);
  assert.deepEqual(file.attribution, ['credit']);
  assert.equal(file.formatVersion, 1);
});

test('buildWordsFile maps rows to the app shape, generated examples first', () => {
  const laconic = buildWordsFile(rows(), []).file.words[1]!;
  assert.equal(laconic.wordId, 2);
  assert.equal(laconic.partOfSpeech, 'adjective');
  assert.deepEqual(
    laconic.senses[0]!.examples.map((e) => e.exampleId),
    [101, 100],
  );
  assert.deepEqual(laconic.senses[0]!.distractors, [{ lemma: 'Very loud.', kind: 'mc', difficulty: 3 }]);
  assert.deepEqual(laconic.relations, [{ relatedLemma: 'terse', relationType: 'synonym' }]);
  assert.deepEqual(laconic.mnemonics, ['Global aid.'], 'personal mnemonics are not exported');
});

test('checkIdStability accepts new words and reports removed ones', () => {
  const prev = [
    { wordId: 1, headword: 'abate' },
    { wordId: 2, headword: 'laconic' },
  ];
  const next = [
    { wordId: 1, headword: 'abate' },
    { wordId: 4, headword: 'quixotic' },
  ];
  assert.deepEqual(checkIdStability(prev, next), { problems: [], removed: ['laconic'] });
});

test('checkIdStability rejects a headword that moved and an id that was reused', () => {
  const prev = [
    { wordId: 1, headword: 'abate' },
    { wordId: 2, headword: 'laconic' },
  ];
  const next = [
    { wordId: 2, headword: 'abate' },
    { wordId: 1, headword: 'quixotic' },
  ];
  const { problems } = checkIdStability(prev, next);
  assert.deepEqual(problems, [
    '"abate" moved from id 1 to 2',
    'id 2 changed from "laconic" to "abate"',
    'id 1 changed from "abate" to "quixotic"',
  ]);
});

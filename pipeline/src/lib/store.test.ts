import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileStore } from './store.ts';
import { Logger } from './logger.ts';

function recordWithSenses(): string {
  const dir = mkdtempSync(join(tmpdir(), 'store-test-'));
  const file = join(dir, 'db.json');
  const sense = (id: number, order: number, definition: string) => ({
    id, word_id: 1, definition, plain_language_definition: null, sense_order: order, register: null,
  });
  writeFileSync(
    file,
    JSON.stringify({
      meta: { note: '', createdAt: '', updatedAt: '' },
      counters: { senses: 12 },
      words: [{ id: 1, headword: 'catalyst', part_of_speech: 'noun', ipa: null, syllables: 3, frequency_rank: 1, difficulty_tier: 1, etymology: null, audio_url: null }],
      senses: [sense(10, 1, 'First.'), sense(11, 2, 'Keep me.'), sense(12, 3, 'Drop me.')],
      example_sentences: [
        { id: 1, sense_id: 11, text: 'Kept example.', audio_url: null, cloze_target: null, source: 'wordnet', is_generated: false },
        { id: 2, sense_id: 12, text: 'Dropped example.', audio_url: null, cloze_target: null, source: 'wordnet', is_generated: false },
      ],
      word_relations: [],
      mnemonics: [],
      distractors: [{ id: 1, sense_id: 12, distractor_lemma: 'Gone.', kind: 'mc', difficulty: 1, source: 'gemini' }],
      audio_objects: [],
    }),
  );
  return file;
}

test('setOtherSenses keeps unchanged senses, drops the rest with their rows, and adds new ones', async () => {
  const store = new JsonFileStore(recordWithSenses(), tmpdir(), false, new Logger(false));
  await store.init();
  await store.setOtherSenses(1, 10, ['A brand new sense.', 'Keep me.']);
  const rows = await store.snapshot();
  const senses = rows.senses.filter((s) => s.word_id === 1).sort((a, b) => a.sense_order - b.sense_order);
  assert.deepEqual(
    senses.map((s) => [s.id, s.sense_order, s.definition]),
    [
      [10, 1, 'First.'],
      [13, 2, 'A brand new sense.'],
      [11, 3, 'Keep me.'],
    ],
  );
  assert.deepEqual(rows.example_sentences.map((e) => e.text), ['Kept example.']);
  assert.deepEqual(rows.distractors, []);
});

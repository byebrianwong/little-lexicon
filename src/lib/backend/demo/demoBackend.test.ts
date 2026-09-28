import AsyncStorage from '@react-native-async-storage/async-storage';
import { DemoBackend } from './demoBackend';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const KEY = 'little_lexicon.demo.v1';

function stateRow(wordId: number) {
  return {
    word_id: wordId,
    due: '2026-01-01T00:00:00.000Z',
    stability: 3,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days: 3,
    reps: 4,
    lapses: 0,
    state: 'review',
    last_review: '2025-12-29T00:00:00.000Z',
    learning_steps: 0,
    is_known: false,
    is_suspended: false,
    first_seen_at: '2025-12-20T00:00:00.000Z',
  };
}

// Progress saved before the words file: ids 1 (ephemeral) and 3 (laconic) in
// the old 12-word numbering, and no wordIdScheme field.
async function saveLegacyProgress(): Promise<void> {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      states: { 1: stateRow(1), 3: stateRow(3) },
      logs: [
        { word_id: 1, rating: 3, reviewed_at: '2025-12-29T00:00:00.000Z' },
        { word_id: 3, rating: 2, reviewed_at: '2025-12-29T00:00:00.000Z' },
      ],
    }),
  );
}

async function saved(): Promise<{
  wordIdScheme?: string;
  states: Record<string, { word_id: number }>;
  logs: { word_id: number }[];
  retired?: unknown;
}> {
  return JSON.parse((await AsyncStorage.getItem(KEY))!);
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('DemoBackend with progress saved under the old numbering', () => {
  it('moves it to the words file ids once, even when screens load at the same time', async () => {
    await saveLegacyProgress();
    const backend = new DemoBackend();

    const [due] = await Promise.all([
      backend.getDueQueue(10),
      backend.getProgressCounts(),
      backend.getProfile(),
      backend.getNewWords(5),
    ]);

    expect(due.map((i) => i.content.headword).sort()).toEqual(['ephemeral', 'laconic']);
    const data = await saved();
    expect(data.wordIdScheme).toBe('words-file');
    expect(data.retired).toBeUndefined();
    const ids = Object.values(data.states).map((s) => s.word_id);
    expect(ids).toHaveLength(2);
    expect(data.logs.map((l) => l.word_id).sort()).toEqual([...ids].sort());
  });

  it('leaves progress alone on the next launch', async () => {
    await saveLegacyProgress();
    await new DemoBackend().getDueQueue(10);
    const first = await saved();

    await new DemoBackend().getDueQueue(10);
    expect(await saved()).toEqual(first);
  });
});

describe('DemoBackend on a fresh install', () => {
  it('serves words from the words file', async () => {
    const backend = new DemoBackend();
    const all = await backend.getAllWords();
    expect(all.length).toBeGreaterThanOrEqual(300);
    const fresh = await backend.getNewWords(5, { minTier: 2, maxTier: 2 });
    expect(fresh).toHaveLength(5);
    expect(fresh.every((i) => i.content.difficultyTier === 2 && i.isNew)).toBe(true);
  });
});

describe('DemoBackend personalization', () => {
  it('uses the headword it is given, not a lookup by id', async () => {
    // Story fixtures and the words file number words differently, so an id
    // lookup would name the wrong word.
    const { text } = await new DemoBackend().generatePersonalized({
      wordId: 2,
      headword: 'quixotic',
      definition: 'Idealistic in a way that is not practical.',
      kind: 'mnemonic',
      interests: ['Science'],
    });
    expect(text).toBe('Picture Science: that scene helps you remember "quixotic".');
  });
});

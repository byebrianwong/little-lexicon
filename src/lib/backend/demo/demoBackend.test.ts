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
    expect(all.length).toBeGreaterThanOrEqual(250);
    const fresh = await backend.getNewWords(5, { levelEstimate: 2 });
    expect(fresh).toHaveLength(5);
    expect(fresh.every((i) => i.isNew)).toBe(true);
    // The first new word comes from the learner's tier.
    expect(fresh[0]!.content.difficultyTier).toBe(2);
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

describe('DemoBackend word reports', () => {
  it('keeps reports on the device, survives a reload, and includes them in the export', async () => {
    const first = new DemoBackend();
    await first.reportWord({ wordId: 6, reason: 'pronunciation', note: 'stress is wrong', screen: 'intro' });
    await first.reportWord({ wordId: 40, reason: 'example', note: null, screen: 'reveal' });

    const reloaded = new DemoBackend();
    const exported = await reloaded.exportData();
    expect(exported.wordReports).toEqual([
      expect.objectContaining({ word_id: 6, reason: 'pronunciation', note: 'stress is wrong', screen: 'intro' }),
      expect.objectContaining({ word_id: 40, reason: 'example', note: null, screen: 'reveal' }),
    ]);
  });
});

describe('DemoBackend saved words and the tracker', () => {
  const card = {
    due: '2026-10-21T10:00:00.000Z',
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    state: 'learning',
    last_review: '2026-10-20T10:00:00.000Z',
    learning_steps: 0,
  };

  it('keeps a saved word after a session has shown it', async () => {
    const backend = new DemoBackend();
    await backend.addToWordList(6);
    await backend.submitReview({
      wordId: 6,
      card,
      rating: 3,
      stateBefore: 'new',
      gameMode: 'mc_word_to_def',
      responseMs: 3000,
      retrievability: null,
      xp: 5,
      isNew: true,
    });

    expect((await backend.getWordList()).map((w) => w.content.wordId)).toEqual([6]);
    // It is no longer new, so a session does not introduce it again.
    expect((await backend.getNewWords(3)).map((i) => i.content.wordId)).not.toContain(6);
  });

  it('builds the history from reviews and practice answers, and keeps it on reload', async () => {
    const first = new DemoBackend();
    await first.submitReview({
      wordId: 6,
      card,
      rating: 1,
      stateBefore: 'new',
      gameMode: 'cloze',
      responseMs: 3000,
      retrievability: null,
      xp: 0,
      isNew: true,
    });
    await first.logPracticeAnswer({ wordId: 6, correct: true, gameMode: 'production' });

    const history = await new DemoBackend().getAnswerHistory();
    expect(history.map((a) => [a.wordId, a.correct])).toEqual([
      [6, false],
      [6, true],
    ]);
    const exported = await new DemoBackend().exportData();
    expect(exported.practiceLogs).toEqual([
      expect.objectContaining({ word_id: 6, correct: true, game_mode: 'production' }),
    ]);
  });

  it('gives a profile saved by an older version the default for known words', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        wordIdScheme: 'words-file',
        profile: { userId: 'demo-user', displayName: 'Old', dailyGoal: 20 },
      }),
    );
    const profile = await new DemoBackend().getProfile();
    expect(profile).toMatchObject({ displayName: 'Old', dailyGoal: 20, knownWordFrequency: 'rarely' });
  });
});

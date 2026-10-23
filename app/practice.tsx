// Endless practice. Plays games over the whole collection, a chunk of words
// at a time, for as long as you want. It never runs out and it is never gated.
//
// It never writes to the review log or reschedules a card: grading a word
// repeatedly in one sitting would destroy its FSRS interval and inflate
// retention. It logs each answer for the word tracker instead, and keeps a
// score for the current run. Which words come up is decided in
// features/games/practice.ts: saved words and recent mistakes more often,
// known words less often.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GameOutcome } from '@/srs/srs';
import type { SessionItem } from '@/lib/types';
import { backend } from '@/lib/backend';
import { qk } from '@/lib/queryClient';
import { useProfile } from '@/features/review/queries';
import { useSavedWords, useWordList } from '@/features/feed/queries';
import { useAnswerHistory } from '@/features/tracker/queries';
import { buildTrackers, type AnswerRecord } from '@/features/tracker/tracker';
import { buildOptionPool, capsForWord } from '@/features/games/optionPool';
import { GameProvider } from '@/features/games/GameContext';
import { GameHost } from '@/features/games/GameHost';
import { buildPracticeChunk, PRACTICE_CHUNK, practiceMode } from '@/features/games/practice';
import { PracticeEmpty, PracticeLoading, PracticeRunner } from '@/features/games/PracticeView';
import { useSettingsStore } from '@/features/settings/settingsStore';

export default function PracticeScreen() {
  const profileQuery = useProfile();
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const qc = useQueryClient();

  const words = useQuery({
    queryKey: ['allWords'],
    queryFn: () => backend.getAllWords(),
  });
  // Practice waits for the list and the history so the first chunk is
  // weighted. If either fails to load, it plays without it.
  const list = useWordList();
  const history = useAnswerHistory();
  const saved = useSavedWords();

  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [queue, setQueue] = useState<SessionItem[]>([]);
  const [index, setIndex] = useState(0);
  const score = useRef({ answered: 0, correct: 0 });
  // This run's answers. The history query is not refetched mid-run, so these
  // are added to it when the next chunk is picked.
  const runAnswers = useRef<AnswerRecord[]>([]);

  const profile = profileQuery.data;
  const loading =
    words.isLoading || profileQuery.isLoading || list.isLoading || history.isLoading;

  // The next chunk, weighted by everything known at the time it is picked:
  // the saved words now (a word saved mid-run starts coming up) and every
  // answer so far.
  const pickChunk = useCallback(
    (played: readonly SessionItem[]) =>
      buildPracticeChunk({
        words: words.data ?? [],
        savedIds: saved.savedIds,
        trackers: buildTrackers([...(history.data ?? []), ...runAnswers.current]),
        frequency: profile?.knownWordFrequency ?? 'rarely',
        played: played.map((i) => i.content.wordId),
        count: PRACTICE_CHUNK,
        seed: seed + Math.floor(played.length / PRACTICE_CHUNK) * 7919,
      }),
    [words.data, saved.savedIds, history.data, profile?.knownWordFrequency, seed],
  );

  // Pick the first chunk once everything has loaded.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || loading || !profile || (words.data ?? []).length === 0) return;
    seeded.current = true;
    setQueue(pickChunk([]));
  }, [loading, profile, words.data, pickChunk]);

  // Answers logged here change the tracker on the saved list.
  useEffect(
    () => () => void qc.invalidateQueries({ queryKey: qk.answerHistory }),
    [qc],
  );

  // Distractors come from the whole collection, not just the queue.
  const pool = useMemo(
    () =>
      buildOptionPool(
        (words.data ?? []).map<SessionItem>((content) => ({
          content,
          state: null,
          isNew: false,
        })),
      ),
    [words.data],
  );

  const current = queue[index];
  const mode = useMemo(() => {
    if (!current) return null;
    return practiceMode(
      capsForWord(current.content, pool),
      current.content.wordId + index,
    );
  }, [current, index, pool]);

  const onOutcome = useCallback(
    (outcome: GameOutcome) => {
      if (!current || !mode) return;
      const wordId = current.content.wordId;
      score.current = {
        answered: score.current.answered + 1,
        correct: score.current.correct + (outcome.correct ? 1 : 0),
      };
      runAnswers.current.push({
        wordId,
        correct: outcome.correct,
        at: new Date(outcome.answeredAt ?? Date.now()).toISOString(),
      });
      backend
        .logPracticeAnswer({ wordId, correct: outcome.correct, gameMode: mode })
        .catch((e: unknown) =>
          console.warn(`practice: failed to log the answer for word ${wordId}`, e),
        );

      const next = index + 1;
      // Pick more before running off the end.
      if (next >= queue.length - 1) setQueue((q) => [...q, ...pickChunk(q)]);
      setIndex(next);
    },
    [current, mode, index, queue.length, pickChunk],
  );

  if (loading) return <PracticeLoading />;

  if (!profile || (words.data ?? []).length === 0) {
    return <PracticeEmpty onBack={() => router.replace('/(app)')} />;
  }

  if (!current || !mode) return <PracticeLoading />;

  const { answered, correct } = score.current;

  return (
    <PracticeRunner
      answered={answered}
      correct={correct}
      onClose={() => router.replace('/(app)')}
    >
      <GameProvider value={{ pool, profile, saved }}>
        <GameHost
          key={`${current.content.wordId}-${index}`}
          item={current}
          mode={mode}
          onOutcome={onOutcome}
          soundEnabled={soundEnabled}
        />
      </GameProvider>
    </PracticeRunner>
  );
}

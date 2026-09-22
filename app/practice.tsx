// Endless practice. Plays games over every word you have, in shuffled rounds,
// for as long as you want. It never runs out and it is never gated.
//
// It also never writes to the review log or reschedules a card: grading a word
// repeatedly in one sitting would destroy its FSRS interval and inflate
// retention. Practice keeps a score for the current run instead.

import { useCallback, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { GameOutcome } from '@/srs/srs';
import type { SessionItem } from '@/lib/types';
import { backend } from '@/lib/backend';
import { useProfile } from '@/features/review/queries';
import { buildOptionPool, capsForWord } from '@/features/games/optionPool';
import { GameProvider } from '@/features/games/GameContext';
import { GameHost } from '@/features/games/GameHost';
import { buildPracticeRound, practiceMode } from '@/features/games/practice';
import { PracticeEmpty, PracticeLoading, PracticeRunner } from '@/features/games/PracticeView';
import { useSettingsStore } from '@/features/settings/settingsStore';

export default function PracticeScreen() {
  const profileQuery = useProfile();
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);

  const words = useQuery({
    queryKey: ['allWords'],
    queryFn: () => backend.getAllWords(),
  });

  const [index, setIndex] = useState(0);
  const score = useRef({ answered: 0, correct: 0 });
  const [, forceRender] = useState(0);

  // The queue grows a round at a time, so it never ends.
  const [rounds, setRounds] = useState(1);
  const queue: SessionItem[] = useMemo(() => {
    const all = words.data ?? [];
    if (all.length === 0) return [];
    const out: SessionItem[] = [];
    for (let r = 0; r < rounds; r++) out.push(...buildPracticeRound(all, r));
    return out;
  }, [words.data, rounds]);

  // Distractors come from the whole collection, not just the current round.
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
    return practiceMode(capsForWord(current.content), current.content.wordId + index);
  }, [current, index]);

  const onOutcome = useCallback(
    (outcome: GameOutcome) => {
      score.current = {
        answered: score.current.answered + 1,
        correct: score.current.correct + (outcome.correct ? 1 : 0),
      };
      const next = index + 1;
      // Extend the queue before running off the end.
      if (next >= queue.length - 1) setRounds((r) => r + 1);
      setIndex(next);
      forceRender((n) => n + 1);
    },
    [index, queue.length],
  );

  if (words.isLoading || profileQuery.isLoading) return <PracticeLoading />;

  const profile = profileQuery.data;

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
      <GameProvider value={{ pool, profile }}>
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

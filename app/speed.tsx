import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionItem } from '@/lib/types';
import { useProfile } from '@/features/review/queries';
import { backend } from '@/lib/backend';
import { submitReview } from '@/features/review/submitReview';
import {
  buildOptionPool,
  buildOptions,
  mulberry32,
  pickDefinitionDistractors,
  type Option,
} from '@/features/games/optionPool';
import {
  ROUND_SECONDS,
  SpeedEmpty,
  SpeedLoading,
  SpeedRoundView,
} from '@/features/games/SpeedView';
import { useSessionResult } from '@/features/session/sessionResult';
import { useSavedWords } from '@/features/feed/queries';
import {
  buildSpeedRound,
  gradesOnSchedule,
  SPEED_ROUND_SIZE,
} from '@/features/games/speedRound';
import { buildTrackers } from '@/features/tracker/tracker';

export default function SpeedRound() {
  const profileQuery = useProfile();
  const setSummary = useSessionResult((s) => s.setSummary);
  const qc = useQueryClient();
  const saved = useSavedWords();

  const [items, setItems] = useState<SessionItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Option | null>(null);
  const [remaining, setRemaining] = useState(ROUND_SECONDS);
  const startedAt = useRef(Date.now());
  const itemStart = useRef(Date.now());
  const totals = useRef({ reviewed: 0, correct: 0, xp: 0 });
  const finished = useRef(false);

  // The round mixes the learner's own words with others near their level
  // (features/games/speedRound). It draws from the whole collection, so it is
  // always playable.
  useEffect(() => {
    (async () => {
      const allWords = backend.getAllWords();
      const [profile, words, due, unseen, list, history] = await Promise.all([
        backend.getProfile(),
        allWords,
        backend.getDueQueue(SPEED_ROUND_SIZE),
        // Every unseen word, only to know which words have no review state.
        allWords.then((w) => backend.getNewWords(w.length)),
        backend.getWordList(),
        backend.getAnswerHistory(),
      ]);
      setItems(
        buildSpeedRound({
          words,
          due,
          unseenIds: new Set(unseen.map((i) => i.content.wordId)),
          savedIds: new Set(list.map((w) => w.content.wordId)),
          trackers: buildTrackers(history),
          levelEstimate: profile.levelEstimate,
          frequency: profile.knownWordFrequency,
          seed: Math.floor(Math.random() * 2 ** 31),
          count: SPEED_ROUND_SIZE,
        }),
      );
    })().catch((e: unknown) => {
      console.warn('speed: failed to build the round', e);
      setItems([]);
    });
  }, []);

  const pool = useMemo(() => buildOptionPool(items ?? []), [items]);
  const current = items?.[index];
  const sense = current?.content.senses[0];

  const options = useMemo<Option[]>(() => {
    if (!current || !sense) return [];
    const rng = mulberry32(current.content.wordId + 21);
    const d = pickDefinitionDistractors(sense, pool, current.content.wordId, 3, rng);
    return buildOptions(sense.definition, d, rng);
  }, [current, sense, pool]);

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    const t = totals.current;
    setSummary({
      reviewed: t.reviewed,
      correct: t.correct,
      xpEarned: t.xp,
      newWords: 0,
      accuracy: t.reviewed > 0 ? t.correct / t.reviewed : 0,
      goalMet: false,
      streakCount: profileQuery.data?.streakCount ?? 0,
      newAchievements: [],
    });
    qc.invalidateQueries();
    router.replace('/summary');
  }, [profileQuery.data, qc, setSummary]);

  // Countdown.
  useEffect(() => {
    if (items === null) return;
    const id = setInterval(() => {
      const left = ROUND_SECONDS - Math.floor((Date.now() - startedAt.current) / 1000);
      setRemaining(left);
      if (left <= 0) finish();
    }, 250);
    return () => clearInterval(id);
  }, [items, finish]);

  async function choose(opt: Option) {
    if (chosen || !current || !profileQuery.data) return;
    setChosen(opt);
    const responseMs = Date.now() - itemStart.current;
    if (!gradesOnSchedule(current)) {
      // Seen and not due: logged like practice, so the schedule stays put.
      const wordId = current.content.wordId;
      totals.current = {
        ...totals.current,
        reviewed: totals.current.reviewed + 1,
        correct: totals.current.correct + (opt.correct ? 1 : 0),
      };
      backend
        .logPracticeAnswer({ wordId, correct: opt.correct, gameMode: 'mc_word_to_def' })
        .catch((e: unknown) =>
          console.warn(`speed: failed to log the answer for word ${wordId}`, e),
        );
    } else {
      try {
        const commit = await submitReview({
          item: current,
          outcome: {
            correct: opt.correct,
            firstAttempt: true,
            hintUsed: false,
            responseMs,
          },
          mode: 'mc_word_to_def',
          profile: profileQuery.data,
        });
        totals.current = {
          reviewed: totals.current.reviewed + 1,
          correct: totals.current.correct + (commit.correct ? 1 : 0),
          xp: totals.current.xp + commit.xp,
        };
      } catch {
        totals.current.reviewed += 1;
      }
    }
    // Auto-advance quickly for the lightning feel.
    setTimeout(() => {
      setChosen(null);
      itemStart.current = Date.now();
      const next = index + 1;
      if (!items || next >= items.length) finish();
      else setIndex(next);
    }, 450);
  }

  if (items === null || profileQuery.isLoading) return <SpeedLoading />;

  if (items.length === 0) return <SpeedEmpty onBack={() => router.replace('/(app)')} />;

  return (
    <SpeedRoundView
      headword={current?.content.headword ?? ''}
      tier={current?.content.difficultyTier ?? null}
      options={options}
      chosen={chosen}
      remaining={remaining}
      answeredCount={totals.current.reviewed}
      saved={current ? saved.savedIds.has(current.content.wordId) : false}
      onToggleSave={() => {
        if (current) saved.toggle(current.content);
      }}
      onChoose={choose}
      onClose={() => router.replace('/(app)')}
    />
  );
}

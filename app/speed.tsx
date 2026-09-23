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

export default function SpeedRound() {
  const profileQuery = useProfile();
  const setSummary = useSessionResult((s) => s.setSummary);
  const qc = useQueryClient();

  const [items, setItems] = useState<SessionItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Option | null>(null);
  const [remaining, setRemaining] = useState(ROUND_SECONDS);
  const startedAt = useRef(Date.now());
  const itemStart = useRef(Date.now());
  const totals = useRef({ reviewed: 0, correct: 0, xp: 0 });
  const finished = useRef(false);

  useEffect(() => {
    (async () => {
      const due = await backend.getDueQueue(40);
      const fresh = due.length < 10 ? await backend.getNewWords(15) : [];
      let pool = [...due, ...fresh];
      // Nothing due and nothing new does not mean nothing to race. Fall back to
      // the whole collection so the speed round is always playable.
      if (pool.length < 5) {
        const all = await backend.getAllWords();
        const have = new Set(pool.map((i) => i.content.wordId));
        pool = [
          ...pool,
          ...all
            .filter((c) => !have.has(c.wordId))
            .map<SessionItem>((content) => ({ content, state: null, isNew: false })),
        ];
      }
      setItems(pool);
    })().catch(() => setItems([]));
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
      options={options}
      chosen={chosen}
      remaining={remaining}
      answeredCount={totals.current.reviewed}
      onChoose={choose}
      onClose={() => router.replace('/(app)')}
    />
  );
}

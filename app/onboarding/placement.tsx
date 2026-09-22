import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { backend } from '@/lib/backend';
import { speakWord } from '@/lib/audio';
import type { WordContent } from '@/lib/types';
import {
  PLACEMENT_LENGTH,
  START_TIER,
  estimateLevel,
  knownWordIds,
  nextTier,
  type PlacementAnswer,
  type PlacementResponse,
} from '@/features/onboarding/placement';
import { useOnboardingStore } from '@/features/onboarding/onboardingStore';
import { PlacementLoading, PlacementView } from '@/features/onboarding/PlacementView';

export default function Placement() {
  const [words, setWords] = useState<WordContent[] | null>(null);
  const [responses, setResponses] = useState<PlacementResponse[]>([]);
  const [tier, setTier] = useState(START_TIER);
  const usedIds = useRef<Set<number>>(new Set());
  const setPlacement = useOnboardingStore((s) => s.setPlacement);

  useEffect(() => {
    backend.getPlacementWords().then(setWords).catch(() => setWords([]));
  }, []);

  const byTier = useMemo(() => {
    const map = new Map<number, WordContent[]>();
    for (const w of words ?? []) {
      const arr = map.get(w.difficultyTier) ?? [];
      arr.push(w);
      map.set(w.difficultyTier, arr);
    }
    return map;
  }, [words]);

  // Recompute the current word whenever the tier changes OR another answer is
  // recorded (responses.length): an "unsure" answer keeps the tier the same, so
  // without the length dependency the same word would repeat.
  const current = useMemo(
    () => pickWord(byTier, tier, usedIds.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byTier, tier, responses.length],
  );

  useEffect(() => {
    if (current) speakWord(current.headword, current.audioUrl);
  }, [current]);

  if (!words) return <PlacementLoading />;

  const done = responses.length >= PLACEMENT_LENGTH || !current;

  function answer(a: PlacementAnswer) {
    if (!current) return;
    usedIds.current.add(current.wordId);
    const next = [...responses, { wordId: current.wordId, tier, answer: a }];
    setResponses(next);
    setTier(nextTier(tier, a));
    if (next.length >= PLACEMENT_LENGTH) finish(next);
  }

  function finish(final: PlacementResponse[]) {
    setPlacement(estimateLevel(final), knownWordIds(final));
    router.replace('/onboarding/goals');
  }

  if (done && current) {
    // Reached length: finish is called in answer(); this is a fallback.
    finish(responses);
  }

  return (
    <PlacementView
      word={current}
      answeredCount={responses.length}
      total={PLACEMENT_LENGTH}
      onAnswer={answer}
      onHear={() => {
        if (current) speakWord(current.headword, current.audioUrl);
      }}
    />
  );
}

function pickWord(
  byTier: Map<number, WordContent[]>,
  tier: number,
  used: Set<number>,
): WordContent | null {
  // Search outward from the target tier for an unused word.
  for (let radius = 0; radius <= 5; radius++) {
    for (const t of [tier - radius, tier + radius]) {
      const arr = byTier.get(t);
      if (!arr) continue;
      const found = arr.find((w) => !used.has(w.wordId));
      if (found) return found;
    }
  }
  return null;
}

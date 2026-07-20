import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, H1, Muted, ProgressBar, Screen, Spacer } from '@/components/ui';
import { backend } from '@/lib/backend';
import { speakWord } from '@/lib/audio';
import { AudioButton } from '@/features/games/Reveal';
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

  if (!words) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6C8CFF" />
        </View>
      </Screen>
    );
  }

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
    <Screen>
      <Spacer h={12} />
      <Muted>{`Question ${responses.length + 1} of ${PLACEMENT_LENGTH}`}</Muted>
      <View className="mt-2">
        <ProgressBar fraction={responses.length / PLACEMENT_LENGTH} />
      </View>

      <View className="flex-1 justify-center">
        <Muted>Do you know this word?</Muted>
        <H1 className="mt-2">{current?.headword}</H1>
        {current?.ipa ? <Muted className="mt-1">{current.ipa}</Muted> : null}
        <View className="mt-4">
          {current ? (
            <AudioButton
              onPress={() => speakWord(current.headword, current.audioUrl)}
              label="Hear it"
            />
          ) : null}
        </View>
        <Body className="mt-4 text-muted">
          Be honest. This just sets your starting difficulty; you can change it later.
        </Body>
      </View>

      <View className="gap-3 pb-4">
        <Button title="I know it" variant="success" onPress={() => answer('know')} />
        <Button title="Not sure" variant="secondary" onPress={() => answer('unsure')} />
        <Button title="Don't know it" variant="ghost" onPress={() => answer('dont_know')} />
      </View>
    </Screen>
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

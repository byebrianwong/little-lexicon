// The placement question: one word, three honest answers. The adaptive tier
// logic and the word picking live in app/onboarding/placement.tsx.

import { ActivityIndicator, View } from 'react-native';
import { Body, Button, H1, Muted, ProgressBar, Screen, Spacer } from '@/components/ui';
import { AudioButton } from '@/features/games/Reveal';
import type { WordContent } from '@/lib/types';
import type { PlacementAnswer } from './placement';

export function PlacementLoading() {
  return (
    <Screen>
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#6C8CFF" />
      </View>
    </Screen>
  );
}

export interface PlacementViewProps {
  /** Null once the pool runs out, which ends the test. */
  word: WordContent | null;
  /** How many have been answered so far. */
  answeredCount: number;
  total: number;
  onAnswer: (answer: PlacementAnswer) => void;
  onHear: () => void;
}

export function PlacementView({
  word,
  answeredCount,
  total,
  onAnswer,
  onHear,
}: PlacementViewProps) {
  return (
    <Screen>
      <Spacer h={12} />
      <Muted>{`Question ${answeredCount + 1} of ${total}`}</Muted>
      <View className="mt-2">
        <ProgressBar fraction={total > 0 ? answeredCount / total : 0} />
      </View>

      <View className="flex-1 justify-center">
        <Muted>Do you know this word?</Muted>
        <H1 className="mt-2">{word?.headword}</H1>
        {word?.ipa ? <Muted className="mt-1">{word.ipa}</Muted> : null}
        <View className="mt-4">
          {word ? <AudioButton onPress={onHear} label="Hear it" /> : null}
        </View>
        <Body className="mt-4 text-muted">
          Be honest. This just sets your starting difficulty; you can change it later.
        </Body>
      </View>

      <View className="gap-3 pb-4">
        <Button title="I know it" variant="success" onPress={() => onAnswer('know')} />
        <Button title="Not sure" variant="secondary" onPress={() => onAnswer('unsure')} />
        <Button title="Don't know it" variant="ghost" onPress={() => onAnswer('dont_know')} />
      </View>
    </Screen>
  );
}

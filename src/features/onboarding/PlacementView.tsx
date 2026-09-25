// The placement question: one word, three honest answers. The adaptive tier
// logic and the word picking live in app/onboarding/placement.tsx.

import { View } from 'react-native';
import {
  Button,
  CenterScreen,
  Headword,
  Label,
  Muted,
  Note,
  ProgressBar,
  Row,
  Screen,
  Spinner,
} from '@/components/ui';
import { AudioButton } from '@/features/games/Reveal';
import type { WordContent } from '@/lib/types';
import type { PlacementAnswer } from './placement';

export function PlacementLoading() {
  return (
    <CenterScreen>
      <Spinner />
    </CenterScreen>
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
      <Row className="justify-between pt-6">
        <Label>Placement</Label>
        <Label>{`Question ${answeredCount + 1} of ${total}`}</Label>
      </Row>
      <View className="mt-3">
        <ProgressBar fraction={total > 0 ? answeredCount / total : 0} />
      </View>

      <View className="flex-1 justify-center">
        <Note className="text-[17px]">Do you know this word?</Note>
        <Headword className="mt-1">{word?.headword}</Headword>
        {word?.ipa ? <Muted className="mt-1">{word.ipa}</Muted> : null}
        <View className="mt-2">
          {word ? <AudioButton onPress={onHear} label="Hear it" /> : null}
        </View>
        <Muted className="mt-6">
          Be honest. This just sets your starting difficulty; you can change it later.
        </Muted>
      </View>

      <View className="gap-3 pb-4">
        <Button title="I know it" onPress={() => onAnswer('know')} />
        <Button title="Not sure" variant="secondary" onPress={() => onAnswer('unsure')} />
        <Button
          title="Don't know it"
          variant="ghost"
          onPress={() => onAnswer('dont_know')}
        />
      </View>
    </Screen>
  );
}

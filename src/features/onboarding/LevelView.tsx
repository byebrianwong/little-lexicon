// The first onboarding step: choose a word level. Each level shows a few of
// its words so the learner can judge. A link leads to the placement test for
// anyone who would rather be measured. app/onboarding/level.tsx saves the
// choice and moves on.

import { Pressable, Text, View } from 'react-native';
import { cx, H1, Label, Muted, Note, Screen, TextButton } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { WORD_LEVELS, type WordLevelOption } from './levels';
import { PLACEMENT_LENGTH } from './placement';

export interface LevelViewProps {
  onPick: (level: WordLevelOption) => void;
  onTakeTest: () => void;
}

export function LevelView({ onPick, onTakeTest }: LevelViewProps) {
  return (
    <Screen scroll>
      <Label className="pt-6">Getting started</Label>
      <H1 className="mt-2">Choose your level</H1>
      <Muted className="mt-2">
        This sets which words you see first. You can change it anytime in Settings.
      </Muted>

      <View className="mt-8">
        {WORD_LEVELS.map((level, i) => (
          <LevelRow
            key={level.id}
            level={level}
            last={i === WORD_LEVELS.length - 1}
            onPress={() => onPick(level)}
          />
        ))}
      </View>

      <TextButton
        className="mt-6"
        label={`Not sure? Take a ${PLACEMENT_LENGTH}-word test`}
        onPress={onTakeTest}
      />
    </Screen>
  );
}

/** A level's name over its sample words. The whole row is the button. */
function LevelRow({
  level,
  last,
  onPress,
}: {
  level: WordLevelOption;
  last: boolean;
  onPress: () => void;
}) {
  const samples = level.samples.join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${level.label}. Words like ${samples}.`}
      onPress={onPress}
      className={cx(
        'min-h-[76px] flex-row items-center justify-between gap-4 border-t border-rule py-4 active:bg-paper-deep web:hover:bg-paper-deep',
        last && 'border-b',
      )}
    >
      <View className="flex-shrink">
        <Text className="font-serif-medium text-[21px] leading-[28px] text-ink">
          {level.label}
        </Text>
        <Note className="mt-1">{samples}</Note>
      </View>
      <Icon name="arrow-right" />
    </Pressable>
  );
}

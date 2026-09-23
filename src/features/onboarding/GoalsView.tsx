// The last onboarding step: pick a daily goal and any interests. It owns both
// selections; app/onboarding/goals.tsx saves them and moves on.

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, H1, Muted, Screen, Spacer } from '@/components/ui';

const GOAL_OPTIONS = [10, 15, 20, 30];
const INTEREST_OPTIONS = [
  'Science',
  'Technology',
  'Business',
  'Literature',
  'History',
  'Arts',
  'Travel',
  'Health',
  'Nature',
  'Politics',
];

export interface GoalsViewProps {
  initialGoal: number;
  initialInterests: string[];
  /** From the placement test, or null when it was skipped. */
  levelEstimate: number | null;
  busy: boolean;
  onFinish: (goal: number, interests: string[]) => void;
}

export function GoalsView({
  initialGoal,
  initialInterests,
  levelEstimate,
  busy,
  onFinish,
}: GoalsViewProps) {
  const [goal, setGoal] = useState(initialGoal);
  const [interests, setInterests] = useState<string[]>(initialInterests);

  function toggleInterest(i: string) {
    setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  }

  return (
    <Screen scroll>
      <Spacer h={12} />
      <H1>Set your pace</H1>
      <Muted className="mt-2">
        How many words per day feels right? You can change this anytime.
      </Muted>

      <View className="mt-4 flex-row flex-wrap gap-3">
        {GOAL_OPTIONS.map((g) => (
          <Chip key={g} label={`${g} / day`} active={goal === g} onPress={() => setGoal(g)} />
        ))}
      </View>

      <Spacer h={28} />
      <H1>What interests you?</H1>
      <Muted className="mt-2">
        We use these to theme example sentences and memory hooks later. Optional.
      </Muted>
      <View className="mt-4 flex-row flex-wrap gap-3">
        {INTEREST_OPTIONS.map((i) => (
          <Chip
            key={i}
            label={i}
            active={interests.includes(i)}
            onPress={() => toggleInterest(i)}
          />
        ))}
      </View>

      <Spacer h={32} />
      <Button title="Start learning" onPress={() => onFinish(goal, interests)} loading={busy} />
      <Spacer h={8} />
      <Body className="text-center text-muted">
        {levelEstimate
          ? `Starting around level ${levelEstimate}.`
          : 'Starting at a comfortable level.'}
      </Body>
    </Screen>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      // Selection is the whole point of these chips, and colour alone does not
      // reach a screen reader.
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`rounded-full border px-4 py-2 ${
        active ? 'border-primary bg-primary/20' : 'border-border bg-surface'
      }`}
    >
      <Text className={`text-sm font-medium ${active ? 'text-primary' : 'text-text'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

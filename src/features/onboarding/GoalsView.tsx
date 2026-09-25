// The last onboarding step: pick a daily goal and any interests. It owns both
// selections; app/onboarding/goals.tsx saves them and moves on.

import { useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  Choice,
  ChoiceGroup,
  H1,
  Label,
  Muted,
  Note,
  Screen,
  Section,
} from '@/components/ui';

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
    setInterests((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
    );
  }

  return (
    <Screen scroll>
      <Label className="pt-6">Getting started</Label>
      <H1 className="mt-2">Set your pace</H1>
      <Muted className="mt-2">
        How many words per day feels right? You can change this anytime.
      </Muted>

      <ChoiceGroup className="mt-5">
        {GOAL_OPTIONS.map((g) => (
          <Choice
            key={g}
            label={`${g} / day`}
            selected={goal === g}
            onPress={() => setGoal(g)}
          />
        ))}
      </ChoiceGroup>

      <Section label="Interests" className="mt-10">
        <Muted>
          We use these to theme example sentences and memory hooks later. Optional.
        </Muted>
        <ChoiceGroup className="mt-4">
          {INTEREST_OPTIONS.map((i) => (
            <Choice
              key={i}
              label={i}
              selected={interests.includes(i)}
              onPress={() => toggleInterest(i)}
            />
          ))}
        </ChoiceGroup>
      </Section>

      <View className="mt-10 gap-3">
        <Button
          title="Start learning"
          trailingIcon="arrow-right"
          onPress={() => onFinish(goal, interests)}
          loading={busy}
        />
        <Note className="text-center">
          {levelEstimate
            ? `Starting around level ${levelEstimate}.`
            : 'Starting at a comfortable level.'}
        </Note>
      </View>
    </Screen>
  );
}

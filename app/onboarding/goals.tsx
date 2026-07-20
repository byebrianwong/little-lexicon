import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Body, Button, H1, Muted, Screen, Spacer } from '@/components/ui';
import { backend } from '@/lib/backend';
import { qk } from '@/lib/queryClient';
import { useOnboardingStore } from '@/features/onboarding/onboardingStore';

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

export default function Goals() {
  const store = useOnboardingStore();
  const qc = useQueryClient();
  const [goal, setGoal] = useState(store.dailyGoal);
  const [interests, setInterests] = useState<string[]>(store.interests);
  const [busy, setBusy] = useState(false);

  function toggleInterest(i: string) {
    setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  }

  async function finish() {
    setBusy(true);
    try {
      if (store.knownWordIds.length > 0) await backend.markKnown(store.knownWordIds);
      await backend.updateProfile({
        levelEstimate: store.levelEstimate ?? undefined,
        dailyGoal: goal,
        interests,
        onboardedAt: new Date().toISOString(),
      });
      await qc.invalidateQueries({ queryKey: qk.profile });
      store.reset();
      router.replace('/(app)');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <Spacer h={12} />
      <H1>Set your pace</H1>
      <Muted className="mt-2">How many words per day feels right? You can change this anytime.</Muted>

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
      <Button title="Start learning" onPress={finish} loading={busy} />
      <Spacer h={8} />
      <Body className="text-center text-muted">
        {store.levelEstimate
          ? `Starting around level ${store.levelEstimate}.`
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

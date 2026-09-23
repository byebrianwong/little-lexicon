import { useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GoalsView } from '@/features/onboarding/GoalsView';
import { useOnboardingStore } from '@/features/onboarding/onboardingStore';
import { backend } from '@/lib/backend';
import { qk } from '@/lib/queryClient';

export default function Goals() {
  const store = useOnboardingStore();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function finish(goal: number, interests: string[]) {
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
    <GoalsView
      initialGoal={store.dailyGoal}
      initialInterests={store.interests}
      levelEstimate={store.levelEstimate}
      busy={busy}
      onFinish={finish}
    />
  );
}

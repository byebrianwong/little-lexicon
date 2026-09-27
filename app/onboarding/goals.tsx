import { useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GoalsView } from '@/features/onboarding/GoalsView';
import { useOnboardingStore } from '@/features/onboarding/onboardingStore';
import { useProfile } from '@/features/review/queries';
import { backend } from '@/lib/backend';
import { qk } from '@/lib/queryClient';

export default function Goals() {
  const store = useOnboardingStore();
  const profile = useProfile();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  // Someone who skipped the intro and takes it later from home may already
  // have a goal and interests set. Start from those rather than the defaults.
  const saved = profile.data?.onboardedAt ? profile.data : null;

  async function finish(goal: number, interests: string[]) {
    setBusy(true);
    try {
      if (store.knownWordIds.length > 0) await backend.markKnown(store.knownWordIds);
      await backend.updateProfile({
        levelEstimate: store.levelEstimate ?? undefined,
        dailyGoal: goal,
        interests,
        // Keep the first date for someone finishing an intro they skipped.
        onboardedAt: saved?.onboardedAt ?? new Date().toISOString(),
      });
      await qc.invalidateQueries({ queryKey: qk.profile });
      store.reset();
      // Back to home: pops to it when the intro was opened from there, and
      // replaces this screen on first run.
      router.dismissTo('/(app)');
    } finally {
      setBusy(false);
    }
  }

  return (
    <GoalsView
      initialGoal={saved?.dailyGoal ?? store.dailyGoal}
      initialInterests={saved?.interests ?? store.interests}
      levelEstimate={store.levelEstimate}
      busy={busy}
      onFinish={finish}
    />
  );
}

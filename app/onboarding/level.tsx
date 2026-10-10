import { router } from 'expo-router';
import { LevelView } from '@/features/onboarding/LevelView';
import { useOnboardingStore } from '@/features/onboarding/onboardingStore';

// The first onboarding step. Picking a level holds it in the onboarding store
// with no known words, the same shape the placement test leaves, and the goals
// screen saves it with the rest.
//
// Each onboarding step replaces the one before. A pushed step stays in the
// browser's history, and going back after finishing would reopen it.
export default function Level() {
  const setPlacement = useOnboardingStore((s) => s.setPlacement);

  return (
    <LevelView
      onPick={(level) => {
        setPlacement(level.levelEstimate, []);
        router.replace('/onboarding/goals');
      }}
      onTakeTest={() => router.replace('/onboarding/placement')}
    />
  );
}

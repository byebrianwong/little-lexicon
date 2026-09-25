import { Redirect } from 'expo-router';
import { useAuthStore } from '@/features/auth/authStore';
import { useProfile } from '@/features/review/queries';
import { CenterScreen, Spinner } from '@/components/ui';

// Entry redirector: routes to auth, onboarding, or the app based on session and
// onboarding state.
export default function Index() {
  const status = useAuthStore((s) => s.status);
  const profileQuery = useProfile();

  if (status === 'loading') return <Splash />;
  if (status === 'signedOut') return <Redirect href="/(auth)/sign-in" />;

  // Signed in: wait for the profile, then check onboarding.
  if (profileQuery.isLoading) return <Splash />;
  const profile = profileQuery.data;
  if (profile && !profile.onboardedAt) return <Redirect href="/onboarding/placement" />;
  return <Redirect href="/(app)" />;
}

function Splash() {
  return (
    <CenterScreen>
      <Spinner size="large" />
    </CenterScreen>
  );
}

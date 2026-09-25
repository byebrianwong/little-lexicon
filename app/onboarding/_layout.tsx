import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/features/auth/authStore';
import { colors } from '@/theme/colors';

export default function OnboardingLayout() {
  const status = useAuthStore((s) => s.status);
  if (status === 'signedOut') return <Redirect href="/(auth)/sign-in" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    />
  );
}

import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/features/auth/authStore';

export default function OnboardingLayout() {
  const status = useAuthStore((s) => s.status);
  if (status === 'signedOut') return <Redirect href="/(auth)/sign-in" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

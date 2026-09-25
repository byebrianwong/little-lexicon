import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/features/auth/authStore';
import { colors } from '@/theme/colors';

export default function AuthLayout() {
  const status = useAuthStore((s) => s.status);
  if (status === 'signedIn') return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    />
  );
}

import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '@/features/auth/authStore';
import { TabBar, useIsWide } from '@/components/TabBar';
import { colors } from '@/theme/colors';

export default function AppLayout() {
  const status = useAuthStore((s) => s.status);
  const wide = useIsWide();
  if (status === 'signedOut') return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'top' : 'bottom',
        sceneStyle: { backgroundColor: colors.paper },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Learn' }} />
      <Tabs.Screen name="browse" options={{ title: 'Words' }} />
      <Tabs.Screen name="stats" options={{ title: 'Progress' }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Ranks' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

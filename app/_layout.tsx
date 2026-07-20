import '../global.css';

import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/features/auth/authStore';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { configurePurchases } from '@/lib/purchases';
import { flushReviewQueue } from '@/features/offline/reviewQueue';

export default function RootLayout() {
  const init = useAuthStore((s) => s.init);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    init();
    hydrateSettings();
    // Best-effort: configure payments (no-op unless the flag is on) and flush
    // any reviews queued while offline.
    configurePurchases().catch(() => {});
    flushReviewQueue().catch(() => {});
  }, [init, hydrateSettings]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <View className="flex-1 bg-bg">
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#0B1020' },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="(app)" />
              <Stack.Screen name="session" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="speed" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="summary" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
            </Stack>
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

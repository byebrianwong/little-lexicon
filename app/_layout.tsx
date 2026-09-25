import '../global.css';

import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/features/auth/authStore';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { configurePurchases } from '@/lib/purchases';
import { flushReviewQueue } from '@/features/offline/reviewQueue';
import { applyUpdateOnStartup } from '@/lib/updates';
import { fontFaces } from '@/theme/fonts';
import { colors } from '@/theme/colors';

// Hold the splash screen until Newsreader is ready, so the first frame is set
// in the right type rather than flashing the system font. No-op on web.
SplashScreen.preventAutoHideAsync().catch((e) => {
  console.warn('Could not hold the splash screen while fonts load', e);
});

export default function RootLayout() {
  const init = useAuthStore((s) => s.init);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const [fontsLoaded, fontError] = useFonts(fontFaces);
  const fontsSettled = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (fontError) {
      // The app still works in the fallback serif, so carry on and say why.
      console.warn('Newsreader failed to load; using the fallback font', fontError);
    }
    if (fontsSettled) {
      SplashScreen.hideAsync().catch((e) => {
        console.warn('Could not hide the splash screen', e);
      });
    }
  }, [fontsSettled, fontError]);

  useEffect(() => {
    init();
    hydrateSettings();
    // Best-effort: configure payments (no-op unless the flag is on) and flush
    // any reviews queued while offline.
    configurePurchases().catch(() => {});
    flushReviewQueue().catch(() => {});
    // Apply a published OTA update straight away rather than on the next
    // launch. No-op in dev and on web; handles its own failures.
    applyUpdateOnStartup();
  }, [init, hydrateSettings]);

  if (!fontsSettled) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <View className="flex-1 bg-paper">
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.paper },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="(app)" />
              <Stack.Screen
                name="session"
                options={{ presentation: 'fullScreenModal' }}
              />
              <Stack.Screen
                name="practice"
                options={{ presentation: 'fullScreenModal' }}
              />
              <Stack.Screen name="speed" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen
                name="summary"
                options={{ presentation: 'fullScreenModal' }}
              />
              <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
            </Stack>
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

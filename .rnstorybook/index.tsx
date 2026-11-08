// The app's entry point when EXPO_PUBLIC_STORYBOOK_ENABLED is 'true'. withStorybook
// in metro.config.js swaps this file in for expo-router/entry, so app/_layout.tsx
// never runs. That is why this file loads the stylesheet and fonts itself and
// registers the root component.
//
// The menu for browsing stories is on unless EXPO_PUBLIC_STORYBOOK_DISABLE_UI is
// 'true'. The Chromatic CLI sets that variable when it builds for capture, so
// there the screen shows one story and Chromatic switches stories over the
// websocket channel. These options are the ones Chromatic's React Native guide
// gives, and its CLI sets the variables they read.

import '../global.css';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerRootComponent } from 'expo';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fontFaces } from '../src/theme/fonts';
import { view } from './storybook.requires';

const StorybookUI = view.getStorybookUI({
  storage: {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  },
  enableWebsockets: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true',
  host: process.env.EXPO_PUBLIC_STORYBOOK_WEBSOCKET_HOST || 'localhost',
  port: parseInt(process.env.EXPO_PUBLIC_STORYBOOK_WEBSOCKET_PORT || '7007', 10),
  secured: process.env.EXPO_PUBLIC_STORYBOOK_WEBSOCKET_SECURED === 'true',
  onDeviceUI: process.env.EXPO_PUBLIC_STORYBOOK_DISABLE_UI !== 'true',
});

function StorybookRoot() {
  const [fontsLoaded, fontError] = useFonts(fontFaces);

  if (fontError) {
    console.warn('Newsreader failed to load in Storybook', fontError);
  }
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StorybookUI />
    </GestureHandlerRootView>
  );
}

registerRootComponent(StorybookRoot);

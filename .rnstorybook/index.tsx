// The app's entry point when EXPO_PUBLIC_STORYBOOK_ENABLED is 'true'. withStorybook
// in metro.config.js swaps this file in for expo-router/entry, so app/_layout.tsx
// never runs. That is why this file loads the stylesheet and fonts itself and
// registers the root component.
//
// The browsing UI is off. The default UI crashes here in BottomSheetTextInput,
// and the menu in @storybook/react-native-ui-lite did not open when tried. The
// screen shows one story, and the websocket channel switches between stories.
// That is the same mode Chromatic uses to capture. The websocket options are the
// ones Chromatic's guide requires, and its CLI sets these variables.

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
  onDeviceUI: false,
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

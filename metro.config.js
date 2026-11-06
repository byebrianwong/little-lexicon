// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Resolve the "browser" export condition on native.
//
// SDK 54 enables package exports, and Expo ships an empty condition list, so a
// package whose exports map lists "browser" before "require" still resolves to
// its Node build. That breaks the native bundle: supabase-js pulls in
// realtime-js, which requires `ws`, whose "require" entry imports the Node
// `stream` module that React Native does not have. Asking for "browser" first
// gives `ws` its browser stub and keeps realtime on the global WebSocket that
// React Native provides. Web already resolved this way, which is why only the
// native bundle failed.
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require'];

const appConfig = withNativeWind(config, { input: './global.css' });

// Storybook on a simulator or phone. The require sits inside the check so the
// app's own builds never load Storybook. When this is on, withStorybook replaces
// the app's entry point with .rnstorybook/index.tsx. The browsing UI stays off
// because it crashes in this app (see that file). The Chromatic CLI overrides
// the websocket host when it builds for capture.
if (process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true') {
  const path = require('node:path');
  const { withStorybook } = require('@storybook/react-native/withStorybook');

  // The first two are the stubs the web Storybook sets up in .storybook/main.ts.
  // Some stories speak a word on mount, and neither sound nor haptics show in a
  // snapshot. The third replaces the spinner with a still shape, and its key is
  // the path react-native/index.js requires it by.
  const stubs = {
    '@/lib/audio': path.resolve(__dirname, '.storybook/mocks/audio.ts'),
    'expo-haptics': path.resolve(__dirname, '.storybook/mocks/expo-haptics.ts'),
    './Libraries/Components/ActivityIndicator/ActivityIndicator': path.resolve(
      __dirname,
      '.rnstorybook/mocks/ActivityIndicator.tsx',
    ),
  };
  const resolveRequest = appConfig.resolver.resolveRequest;
  appConfig.resolver.resolveRequest = (context, moduleName, platform) =>
    stubs[moduleName]
      ? { type: 'sourceFile', filePath: stubs[moduleName] }
      : (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);

  module.exports = withStorybook(appConfig, {
    enabled: true,
    disableUI: true,
    websockets: { host: 'localhost', port: 7007 },
  });
} else {
  module.exports = appConfig;
}

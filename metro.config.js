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
  const { withStorybook } = require('@storybook/react-native/withStorybook');
  module.exports = withStorybook(appConfig, {
    enabled: true,
    disableUI: true,
    websockets: { host: 'localhost', port: 7007 },
  });
} else {
  module.exports = appConfig;
}

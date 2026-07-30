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

module.exports = withNativeWind(config, { input: './global.css' });

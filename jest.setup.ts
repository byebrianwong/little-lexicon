// Jest setup. Pure-logic tests dominate; keep native mocks minimal.

// Provide a stable, network-free environment for tests.
process.env.EXPO_PUBLIC_DEMO_MODE = 'true';

// Jest cannot run a dynamic import() without Metro, so load the words file
// with require instead. Everything else in src/lib/content runs unchanged.
jest.mock('@/lib/content/importWordsFile', () => ({
  importWordsFile: () => Promise.resolve({ default: require('@/content/words.json') }),
}));

// Reanimated ships an official mock for the test environment.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

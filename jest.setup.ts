// Jest setup. Pure-logic tests dominate; keep native mocks minimal.

// Provide a stable, network-free environment for tests.
process.env.EXPO_PUBLIC_DEMO_MODE = 'true';

// Jest cannot run a dynamic import() without Metro, so load the words file
// with require instead. Everything else in src/lib/content runs unchanged.
jest.mock('@/lib/content/importWordsFile', () => ({
  importWordsFile: () => Promise.resolve({ default: require('@/content/words.json') }),
}));

// The bundled clip list requires MP3s through Metro, so tests get an empty one
// and src/lib/audio falls back to device speech.
jest.mock('@/lib/importAudioClips', () => ({
  importAudioClips: () => Promise.resolve({ wordClips: {}, sentenceClips: {} }),
}));

// Reanimated ships an official mock for the test environment.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

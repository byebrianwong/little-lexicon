// The speech fallback in play(): it speaks the word only when the clip did not
// load, and never after the screen that asked for it has gone.

import * as Speech from 'expo-speech';
import { clipLoaded, speakWord, stopAudio } from './audio';

// What the fake player reports when the load timeout checks it.
const mockPlayer = { isLoaded: false, duration: 0, play: jest.fn(), remove: jest.fn() };

jest.mock('expo-audio', () => ({
  createAudioPlayer: () => mockPlayer,
  setAudioModeAsync: () => Promise.resolve(),
}));
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  getAvailableVoicesAsync: () => Promise.resolve([]),
}));
jest.mock('./audioPack', () => ({ localClip: () => null }));

const word = { wordId: 1, headword: 'laconic', audioUrl: 'audio/words/1.mp3' };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  stopAudio();
  jest.useRealTimers();
});

describe('clipLoaded', () => {
  it('counts a clip that is ready', () => {
    expect(clipLoaded({ isLoaded: true, duration: 1.2 })).toBe(true);
  });

  it('counts a clip that has finished on Android, where isLoaded turns false', () => {
    expect(clipLoaded({ isLoaded: false, duration: 1.2 })).toBe(true);
  });

  it('does not count a clip with no duration (0 on Android, NaN on iOS and web)', () => {
    expect(clipLoaded({ isLoaded: false, duration: 0 })).toBe(false);
    expect(clipLoaded({ isLoaded: false, duration: NaN })).toBe(false);
  });
});

describe('speakWord fallback', () => {
  it('does not speak the word again after its clip has played', async () => {
    Object.assign(mockPlayer, { isLoaded: false, duration: 0 });
    await speakWord(word);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);

    // Android after a one-second clip: no longer ready, but it has a duration.
    mockPlayer.duration = 1.2;
    jest.advanceTimersByTime(5000);

    expect(Speech.speak).not.toHaveBeenCalled();
    expect(mockPlayer.remove).not.toHaveBeenCalled();
  });

  it('speaks the word when the clip never loaded', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    Object.assign(mockPlayer, { isLoaded: false, duration: 0 });
    await speakWord(word);
    jest.advanceTimersByTime(5000);
    expect(Speech.speak).toHaveBeenCalledWith('laconic', expect.anything());
    expect(warn).toHaveBeenCalledWith(
      'audio: clip did not load, falling back to speech',
      expect.anything(),
    );
    warn.mockRestore();
  });

  it('does not speak once stopAudio has run, as when the screen closes', async () => {
    Object.assign(mockPlayer, { isLoaded: false, duration: 0 });
    await speakWord(word);
    stopAudio();
    jest.advanceTimersByTime(5000);
    expect(Speech.speak).not.toHaveBeenCalled();
  });
});

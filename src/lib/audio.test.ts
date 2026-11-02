// The speech fallback in play(): it speaks the word only when the clip did not
// load, and never after the screen that asked for it has gone. Also which
// clip speakHook plays.

import * as Speech from 'expo-speech';
import { clipLoaded, speakHook, speakWord, stopAudio } from './audio';

// What the fake player reports when the load timeout checks it.
const mockPlayer = { isLoaded: false, duration: 0, play: jest.fn(), remove: jest.fn() };
const mockCreatePlayer = jest.fn((_source: unknown) => mockPlayer);
// The offline pack's copy of a clip; none unless a test sets one.
const mockLocalClip = jest.fn((_audioUrl: string | null | undefined): { uri: string } | null => null);

jest.mock('expo-audio', () => ({
  createAudioPlayer: (source: unknown) => mockCreatePlayer(source),
  setAudioModeAsync: () => Promise.resolve(),
}));
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  getAvailableVoicesAsync: () => Promise.resolve([]),
}));
jest.mock('./audioPack', () => ({
  localClip: (audioUrl: string | null | undefined) => mockLocalClip(audioUrl),
}));

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

describe('speakHook', () => {
  const hook = 'Laconic comes from Laconia, whose Spartans used few words.';
  const hooked = { mnemonics: [hook], hookAudioUrl: 'audio/hooks/1.mp3?v=abcdef123456' };

  it("plays the hook's clip from the site", async () => {
    Object.assign(mockPlayer, { isLoaded: true, duration: 4.2 });
    await speakHook(hooked);
    expect(mockCreatePlayer).toHaveBeenCalledWith({
      uri: expect.stringMatching(/\/audio\/hooks\/1\.mp3\?v=abcdef123456$/),
    });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it('plays the copy in the offline pack first', async () => {
    Object.assign(mockPlayer, { isLoaded: true, duration: 4.2 });
    mockLocalClip.mockReturnValueOnce({ uri: 'file:///pack/abcdef123456.mp3' });
    await speakHook(hooked);
    expect(mockLocalClip).toHaveBeenCalledWith(hooked.hookAudioUrl);
    expect(mockCreatePlayer).toHaveBeenCalledWith({ uri: 'file:///pack/abcdef123456.mp3' });
  });

  it('speaks the hook with the device voice when there is no clip', async () => {
    await speakHook({ mnemonics: [hook], hookAudioUrl: null });
    expect(mockCreatePlayer).not.toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledWith(hook, expect.anything());
  });

  it('speaks the hook when its clip never loaded', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    Object.assign(mockPlayer, { isLoaded: false, duration: 0 });
    await speakHook(hooked);
    jest.advanceTimersByTime(5000);
    expect(Speech.speak).toHaveBeenCalledWith(hook, expect.anything());
    warn.mockRestore();
  });

  it('does nothing for a word without a hook', async () => {
    await speakHook({ mnemonics: [], hookAudioUrl: null });
    expect(mockCreatePlayer).not.toHaveBeenCalled();
    expect(Speech.speak).not.toHaveBeenCalled();
  });
});

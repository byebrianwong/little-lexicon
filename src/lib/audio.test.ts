import { createAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { clipLoaded, speakWord } from './audio';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-speech', () => ({
  getAvailableVoicesAsync: jest.fn(() => Promise.resolve([])),
  speak: jest.fn(),
  stop: jest.fn(),
}));
jest.mock('./audioPack', () => ({ localClip: () => null }));

const word = { wordId: 307, headword: 'vindicate', audioUrl: 'audio/words/307.mp3?v=bee19622fe50' };

/** A player as expo-audio reports it before the clip loads. */
function fakePlayer() {
  const player = { isLoaded: false, duration: 0, play: jest.fn(), remove: jest.fn() };
  jest.mocked(createAudioPlayer).mockReturnValue(player as unknown as ReturnType<typeof createAudioPlayer>);
  return player;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('clipLoaded', () => {
  it('is false before the clip loads, on every platform', () => {
    expect(clipLoaded({ isLoaded: false, duration: 0 })).toBe(false);
    expect(clipLoaded({ isLoaded: false, duration: NaN })).toBe(false);
  });

  it('is true while the clip is ready', () => {
    expect(clipLoaded({ isLoaded: true, duration: 0.9 })).toBe(true);
  });

  it('is true after the clip ended on Android, where isLoaded turns false', () => {
    expect(clipLoaded({ isLoaded: false, duration: 0.9 })).toBe(true);
  });
});

describe('speakWord', () => {
  it('plays the clip once, with no speech, when the clip has ended by the load check', async () => {
    const player = fakePlayer();
    await speakWord(word);
    expect(player.play).toHaveBeenCalledTimes(1);

    // Android after a one-second clip: no longer "ready", but it has a duration.
    player.duration = 0.9;
    jest.advanceTimersByTime(4000);

    expect(Speech.speak).not.toHaveBeenCalled();
    expect(player.remove).not.toHaveBeenCalled();
  });

  it('speaks the word instead when the clip has not loaded after 4 seconds', async () => {
    const player = fakePlayer();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await speakWord(word);

    jest.advanceTimersByTime(4000);

    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenCalledWith('vindicate', expect.objectContaining({ rate: 0.9 }));
  });
});

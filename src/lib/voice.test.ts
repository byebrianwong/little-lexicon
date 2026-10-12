import { pickVoice, type VoiceInfo } from './voice';

const v = (identifier: string, language: string, quality = 'Default', name = identifier): VoiceInfo => ({
  identifier,
  name,
  language,
  quality,
});

describe('pickVoice', () => {
  it('prefers premium over enhanced over compact on iOS', () => {
    const voices = [
      v('com.apple.voice.compact.en-US.Samantha', 'en-US'),
      v('com.apple.voice.enhanced.en-US.Evan', 'en-US', 'Enhanced'),
      v('com.apple.voice.premium.en-US.Zoe', 'en-US', 'Enhanced'),
    ];
    expect(pickVoice(voices)).toBe('com.apple.voice.premium.en-US.Zoe');
    expect(pickVoice(voices.slice(0, 2))).toBe('com.apple.voice.enhanced.en-US.Evan');
  });

  it('skips novelty and eloquence voices', () => {
    expect(
      pickVoice([
        v('com.apple.speech.synthesis.voice.Bells', 'en-US'),
        v('com.apple.eloquence.en-US.Eddy', 'en-US'),
      ]),
    ).toBeUndefined();
  });

  it('prefers US English, then other English, and never another language', () => {
    expect(pickVoice([v('fr', 'fr-FR', 'Enhanced'), v('gb', 'en-GB'), v('us', 'en-US')])).toBe('us');
    expect(pickVoice([v('fr', 'fr-FR', 'Enhanced'), v('gb', 'en_GB')])).toBe('gb');
    expect(pickVoice([v('fr', 'fr-FR')])).toBeUndefined();
  });

  it('prefers network voices on Android and natural or Google voices on web', () => {
    expect(
      pickVoice([v('en-us-x-sfg-local', 'en-US'), v('en-us-x-sfg-network', 'en-US')]),
    ).toBe('en-us-x-sfg-network');
    expect(
      pickVoice([
        v('Samantha', 'en-US'),
        v('Google US English', 'en-US'),
        v('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
      ]),
    ).toBe('Microsoft Aria Online (Natural) - English (United States)');
  });
});

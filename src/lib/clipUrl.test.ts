import { DEFAULT_AUDIO_HOST, resolveClipUrl } from './clipUrl';

describe('resolveClipUrl', () => {
  const url = 'audio/words/1.mp3?v=f6a11b644f7b';

  it('joins the host and the audioUrl', () => {
    expect(resolveClipUrl(url, DEFAULT_AUDIO_HOST)).toBe(
      'https://littlelexicon.byebrianwong.com/audio/words/1.mp3?v=f6a11b644f7b',
    );
    expect(resolveClipUrl(url, 'http://127.0.0.1:8081/')).toBe(
      'http://127.0.0.1:8081/audio/words/1.mp3?v=f6a11b644f7b',
    );
  });

  it('gives a path from the site root on web', () => {
    expect(resolveClipUrl(url, '')).toBe('/audio/words/1.mp3?v=f6a11b644f7b');
  });

  it('keeps a full URL and gives null for no audioUrl', () => {
    expect(resolveClipUrl('https://cdn.example.com/a.mp3', '')).toBe('https://cdn.example.com/a.mp3');
    expect(resolveClipUrl(null, DEFAULT_AUDIO_HOST)).toBeNull();
    expect(resolveClipUrl('', DEFAULT_AUDIO_HOST)).toBeNull();
  });
});

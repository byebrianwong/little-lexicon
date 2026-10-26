import type { WordContent } from '@/lib/types';
import { clipHash, forEachLimited, looksLikeMp3, planSync, wantedClips } from './plan';

function word(id: number, audioUrl: string | null, examples: (string | null)[]): WordContent {
  return {
    wordId: id,
    headword: `word${id}`,
    partOfSpeech: 'noun',
    ipa: null,
    syllables: 1,
    difficultyTier: 1,
    frequencyRank: null,
    etymology: null,
    audioUrl,
    senses: [
      {
        senseId: id * 10,
        definition: 'A meaning.',
        plainLanguageDefinition: null,
        senseOrder: 1,
        register: null,
        examples: examples.map((url, i) => ({
          exampleId: id * 100 + i,
          text: 'An example.',
          audioUrl: url,
          clozeTarget: null,
        })),
        distractors: [],
      },
    ],
    relations: [],
    mnemonics: [],
  };
}

describe('clipHash', () => {
  it('reads the hash from an audioUrl', () => {
    expect(clipHash('audio/words/1.mp3?v=f6a11b644f7b')).toBe('f6a11b644f7b');
    expect(clipHash('https://x.example/a.mp3?x=1&v=abc123&y=2')).toBe('abc123');
  });

  it('gives null without a hash', () => {
    expect(clipHash('audio/words/1.mp3')).toBeNull();
    expect(clipHash('audio/words/1.mp3?v=NOTHEX')).toBeNull();
    expect(clipHash(null)).toBeNull();
  });
});

describe('wantedClips', () => {
  it('collects word and sentence clips by hash, skipping ones without a URL', () => {
    const wanted = wantedClips([
      word(1, 'audio/words/1.mp3?v=aaaaaa', ['audio/sentences/100.mp3?v=bbbbbb', null]),
      word(2, null, ['audio/sentences/200.mp3?v=cccccc']),
    ]);
    expect([...wanted]).toEqual([
      ['aaaaaa', 'audio/words/1.mp3?v=aaaaaa'],
      ['bbbbbb', 'audio/sentences/100.mp3?v=bbbbbb'],
      ['cccccc', 'audio/sentences/200.mp3?v=cccccc'],
    ]);
  });
});

describe('planSync', () => {
  it('downloads what is missing and removes what is unused', () => {
    const wanted = new Map([
      ['aaaaaa', 'audio/words/1.mp3?v=aaaaaa'],
      ['bbbbbb', 'audio/sentences/100.mp3?v=bbbbbb'],
    ]);
    expect(planSync(wanted, ['bbbbbb', 'dddddd'])).toEqual({
      download: [{ hash: 'aaaaaa', audioUrl: 'audio/words/1.mp3?v=aaaaaa' }],
      remove: ['dddddd'],
    });
  });

  it('does nothing when the phone already matches', () => {
    const wanted = new Map([['aaaaaa', 'audio/words/1.mp3?v=aaaaaa']]);
    expect(planSync(wanted, ['aaaaaa'])).toEqual({ download: [], remove: [] });
  });
});

describe('looksLikeMp3', () => {
  it('accepts an ID3 tag or an MPEG frame', () => {
    expect(looksLikeMp3(new Uint8Array([0x49, 0x44, 0x33, 4]))).toBe(true);
    expect(looksLikeMp3(new Uint8Array([0xff, 0xf3, 0x64, 0xc4]))).toBe(true);
  });

  it('rejects HTML and empty files', () => {
    expect(looksLikeMp3(new TextEncoder().encode('<!DOCTYPE html>'))).toBe(false);
    expect(looksLikeMp3(new Uint8Array([]))).toBe(false);
  });
});

describe('forEachLimited', () => {
  it('runs every item, never more than the limit at once', async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    await forEachLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      done.push(n);
      running -= 1;
    });
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(most).toBe(3);
  });

  it('handles an empty list', async () => {
    await expect(forEachLimited([], 4, () => Promise.resolve())).resolves.toBeUndefined();
  });
});

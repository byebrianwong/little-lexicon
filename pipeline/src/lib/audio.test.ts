import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClipModule, buildTtsRequest, clipKey, ipaForTts, pickUsRecording } from './audio.ts';

test('ipaForTts strips the slashes the words file uses', () => {
  assert.equal(ipaForTts('/əˈbeɪt/'), 'əˈbeɪt');
  assert.equal(ipaForTts(' /kwiˈɛsənt/ '), 'kwiˈɛsənt');
  assert.equal(ipaForTts('//'), null);
  assert.equal(ipaForTts(null), null);
});

test('buildTtsRequest pins the headword when the text contains it exactly', () => {
  const body = buildTtsRequest({
    text: 'Her fear began to abate once the plane leveled off.',
    voice: 'en-US-Chirp3-HD-Kore',
    language: 'en-US',
    pin: { headword: 'abate', ipa: 'əˈbeɪt' },
  });
  assert.deepEqual(body, {
    input: {
      text: 'Her fear began to abate once the plane leveled off.',
      customPronunciations: {
        pronunciations: [
          { phrase: 'abate', phoneticEncoding: 'PHONETIC_ENCODING_IPA', pronunciation: 'əˈbeɪt' },
        ],
      },
    },
    voice: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Kore' },
    audioConfig: { audioEncoding: 'MP3' },
  });
});

test('buildTtsRequest leaves inflected or embedded forms to the voice', () => {
  const pin = { headword: 'abate', ipa: 'əˈbeɪt' };
  const base = { voice: 'v', language: 'en-US', pin };
  const inflected = buildTtsRequest({ ...base, text: 'The storm abated.' });
  assert.equal((inflected.input as Record<string, unknown>).customPronunciations, undefined);
  const capitalized = buildTtsRequest({ ...base, text: 'Abate the noise.' });
  assert.equal((capitalized.input as Record<string, unknown>).customPronunciations, undefined);
  const headwordAlone = buildTtsRequest({ ...base, text: 'abate' });
  assert.ok((headwordAlone.input as Record<string, unknown>).customPronunciations);
  const unpinned = buildTtsRequest({ ...base, pin: null, text: 'abate' });
  assert.equal((unpinned.input as Record<string, unknown>).customPronunciations, undefined);
});

test('clipKey changes when any input changes', () => {
  const a = clipKey({ text: 'abate', ipa: '/əˈbeɪt/', voice: 'Kore' });
  assert.equal(a, clipKey({ text: 'abate', ipa: '/əˈbeɪt/', voice: 'Kore' }));
  assert.notEqual(a, clipKey({ text: 'abate', ipa: '/əˈbet/', voice: 'Kore' }));
  assert.notEqual(a, clipKey({ text: 'abate', ipa: '/əˈbeɪt/', voice: 'Charon' }));
});

test('pickUsRecording takes only US clips', () => {
  assert.equal(pickUsRecording(null), null);
  assert.equal(
    pickUsRecording([{ phonetics: [{ audio: 'https://x/media/abate-uk.mp3' }, { audio: '' }] }]),
    null,
  );
  assert.deepEqual(
    pickUsRecording([
      { phonetics: [{ audio: 'https://x/media/abate-uk.mp3' }] },
      {
        phonetics: [
          {
            audio: 'https://x/media/abate-us.mp3',
            sourceUrl: 'https://commons.wikimedia.org/w/index.php?curid=1',
            license: { name: 'BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0' },
          },
        ],
      },
    ]),
    {
      url: 'https://x/media/abate-us.mp3',
      sourceUrl: 'https://commons.wikimedia.org/w/index.php?curid=1',
      license: 'BY-SA 4.0',
    },
  );
});

test('buildClipModule sorts entries by id and requires each file', () => {
  const source = buildClipModule(
    [
      { id: 12, requirePath: '../../assets/audio/words/12.mp3' },
      { id: 3, requirePath: '../../assets/audio/words/3.mp3' },
    ],
    [],
  );
  assert.match(
    source,
    /wordClips: Record<number, AudioSource> = \{\n {2}3: require\('\.\.\/\.\.\/assets\/audio\/words\/3\.mp3'\),\n {2}12: /,
  );
  assert.match(source, /sentenceClips: Record<number, AudioSource> = \{\n\};/);
});

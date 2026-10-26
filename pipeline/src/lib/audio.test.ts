import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clipKey,
  clipMatches,
  clipUrl,
  humanClipKey,
  ipaToKokoro,
  kokoroText,
  pickUsRecording,
  sentenceClipKey,
  ttsVoiceLabel,
  wordClipKey,
} from './audio.ts';

test('ipaToKokoro turns IPA into Kokoro letters with stress before the vowel', () => {
  assert.equal(ipaToKokoro('/əˈbeɪt/'), 'əbˈAt');
  assert.equal(ipaToKokoro(' /əbˈsikwiəs/ '), 'əbsˈikwiəs');
  assert.equal(ipaToKokoro('/ˈɛrəˌdaɪt/'), 'ˈɛɹədˌIt');
  assert.equal(ipaToKokoro('/ˈbɝdʒən/'), 'bˈɜɹʤən');
  assert.equal(ipaToKokoro('/ˈfætʃuəs/'), 'fˈæʧuəs');
  assert.equal(ipaToKokoro('/ˈsʌmɚ/'), 'sˈʌməɹ');
  assert.equal(ipaToKokoro('/ˈaʊtˌkraɪ/'), 'ˈWtkɹˌI');
  assert.equal(ipaToKokoro('/ɪkˈspɔɪl/'), 'ɪkspˈYl');
});

test('ipaToKokoro stresses one-syllable words, which IPA leaves unmarked', () => {
  assert.equal(ipaToKokoro('/ɡoʊʃ/'), 'ɡˈOʃ');
  assert.equal(ipaToKokoro('/stɔɪk/'), 'stˈYk');
});

test('ipaToKokoro gives null for no IPA or a symbol Kokoro cannot read', () => {
  assert.equal(ipaToKokoro(null), null);
  assert.equal(ipaToKokoro('//'), null);
  assert.equal(ipaToKokoro('/ˈbɑːθ/'), null);
  assert.equal(ipaToKokoro('/ˈbɒtəl/'), null);
});

test('kokoroText pins the headword, also with a capital first letter', () => {
  const pin = { headword: 'abate', phonemes: 'əbˈAt' };
  assert.equal(
    kokoroText('Her fear began to abate once the plane leveled off.', pin),
    'Her fear began to [abate](/əbˈAt/) once the plane leveled off.',
  );
  assert.equal(kokoroText('Abate the noise, abate it.', pin), '[Abate](/əbˈAt/) the noise, [abate](/əbˈAt/) it.');
  assert.equal(kokoroText('abate', pin), '[abate](/əbˈAt/)');
});

test('kokoroText leaves inflected and embedded forms to the voice', () => {
  const pin = { headword: 'abate', phonemes: 'əbˈAt' };
  assert.equal(kokoroText('The storm abated.', pin), 'The storm abated.');
  assert.equal(kokoroText('It was unabate.', pin), 'It was unabate.');
  assert.equal(kokoroText('ABATE now.', pin), 'ABATE now.');
  assert.equal(kokoroText('abate', null), 'abate');
});

test('clip keys change with the inputs each kind of clip depends on', () => {
  const word = { headword: 'abate', ipa: '/əˈbeɪt/' };
  const fixed = { headword: 'abate', ipa: '/əˈbet/' };
  const voice = ttsVoiceLabel('af_heart');
  assert.equal(voice, 'kokoro-82m/af_heart/32k');
  assert.equal(humanClipKey(word), humanClipKey(fixed));
  assert.notEqual(wordClipKey(word, voice), wordClipKey(fixed, voice));
  assert.notEqual(wordClipKey(word, voice), wordClipKey(word, ttsVoiceLabel('af_bella')));
  const text = 'The storm abated.';
  assert.notEqual(sentenceClipKey(text, word, voice), sentenceClipKey('The storm passed.', word, voice));
  assert.notEqual(sentenceClipKey(text, word, voice), sentenceClipKey(text, fixed, voice));
});

test('clipMatches accepts only clips made from the current text and IPA', () => {
  const word = { headword: 'abate', ipa: '/əˈbeɪt/' };
  const fixed = { headword: 'abate', ipa: '/əˈbet/' };
  const voice = ttsVoiceLabel('af_heart');
  const wordClip = { source: 'tts', voice, key: wordClipKey(word, voice) };
  assert.equal(clipMatches(wordClip, word, null), true);
  assert.equal(clipMatches(wordClip, fixed, null), false);
  const text = 'The storm abated.';
  const sentenceClip = { source: 'tts', voice, key: sentenceClipKey(text, word, voice) };
  assert.equal(clipMatches(sentenceClip, word, text), true);
  assert.equal(clipMatches(sentenceClip, word, 'The storm passed.'), false);
  const human = { source: 'human', key: humanClipKey(word) };
  assert.equal(clipMatches(human, fixed, null), true);
  assert.equal(clipMatches({ source: 'tts', key: wordClip.key }, word, null), false);
  assert.equal(clipMatches({ source: 'stub', key: wordClip.key }, word, null), false);
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

test('clipUrl names the file and a hash of its bytes', () => {
  const a = clipUrl('words/12.mp3', new Uint8Array([1, 2, 3]));
  assert.match(a, /^audio\/words\/12\.mp3\?v=[0-9a-f]{12}$/);
  assert.equal(a, clipUrl('words/12.mp3', new Uint8Array([1, 2, 3])));
  assert.notEqual(a, clipUrl('words/12.mp3', new Uint8Array([1, 2, 4])));
});

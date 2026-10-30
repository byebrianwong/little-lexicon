import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clipKey,
  clipMatches,
  clipUrl,
  definitionClipKey,
  hookClipKey,
  humanClipKey,
  ipaToKokoro,
  kokoroText,
  pickUsRecording,
  sentenceClipKey,
  shownHook,
  spokenDefinition,
  ttsVoiceLabel,
  wordClipKey,
} from './audio.ts';
import { buildWordsFile } from './exportContent.ts';

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
  const definition = 'To calm down after being at its worst.';
  assert.notEqual(definitionClipKey(definition, word, voice), definitionClipKey('To calm down.', word, voice));
  assert.notEqual(definitionClipKey(definition, word, voice), definitionClipKey(definition, fixed, voice));
  // The same text as a sentence and as a definition are different clips.
  assert.notEqual(definitionClipKey(text, word, voice), sentenceClipKey(text, word, voice));
  const hook = 'Abate sounds like a bat that settles down.';
  assert.notEqual(hookClipKey(hook, word, voice), hookClipKey('A bat settles.', word, voice));
  assert.notEqual(hookClipKey(hook, word, voice), hookClipKey(hook, fixed, voice));
  assert.notEqual(hookClipKey(hook, word, voice), hookClipKey(hook, word, ttsVoiceLabel('af_bella')));
  assert.notEqual(hookClipKey(text, word, voice), definitionClipKey(text, word, voice));
});

test('shownHook reads the first global hook by id, as the app shows it', () => {
  const mnemonics = [
    { id: 9, word_id: 1, text: 'Later hook.', source: 'claude' as const, user_id: null },
    { id: 3, word_id: 1, text: 'Personal hook.', source: 'claude' as const, user_id: 'user-1' },
    { id: 5, word_id: 1, text: 'First hook.', source: 'claude' as const, user_id: null },
  ];
  assert.equal(shownHook(mnemonics), 'First hook.');
  assert.equal(shownHook(mnemonics.filter((m) => m.user_id !== null)), null);
  assert.equal(shownHook([]), null);
  // Stage 05 reads the export's first hook; both must name the same one.
  const { file } = buildWordsFile(
    {
      words: [
        {
          id: 1,
          headword: 'abate',
          part_of_speech: 'verb',
          ipa: null,
          syllables: 2,
          frequency_rank: null,
          difficulty_tier: 1,
          etymology: null,
          audio_url: null,
        },
      ],
      senses: [{ id: 10, word_id: 1, definition: 'Lessen.', plain_language_definition: null, sense_order: 1, register: null }],
      example_sentences: [],
      word_relations: [],
      mnemonics,
      distractors: [],
    },
    [],
  );
  assert.equal(file.words[0]!.mnemonics[0], shownHook(mnemonics));
  assert.equal(file.words[0]!.hookAudioUrl, null);
});

test('spokenDefinition reads the plain definition when there is one', () => {
  assert.equal(spokenDefinition('To calm down.', 'Ease off from a fierce level.'), 'To calm down.');
  assert.equal(spokenDefinition(null, 'Ease off from a fierce level.'), 'Ease off from a fierce level.');
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
  assert.equal(clipMatches(sentenceClip, word, { kind: 'sentence', text }), true);
  assert.equal(clipMatches(sentenceClip, word, { kind: 'sentence', text: 'The storm passed.' }), false);
  assert.equal(clipMatches(sentenceClip, word, { kind: 'definition', text }), false);
  const definition = 'To calm down after being at its worst.';
  const definitionClip = { source: 'tts', voice, key: definitionClipKey(definition, word, voice) };
  assert.equal(clipMatches(definitionClip, word, { kind: 'definition', text: definition }), true);
  assert.equal(clipMatches(definitionClip, word, { kind: 'definition', text: 'To calm down.' }), false);
  assert.equal(clipMatches(definitionClip, fixed, { kind: 'definition', text: definition }), false);
  const hook = 'Abate sounds like a bat that settles down.';
  const hookClip = { source: 'tts', voice, key: hookClipKey(hook, word, voice) };
  assert.equal(clipMatches(hookClip, word, { kind: 'hook', text: hook }), true);
  assert.equal(clipMatches(hookClip, word, { kind: 'hook', text: 'A bat settles.' }), false);
  assert.equal(clipMatches(hookClip, fixed, { kind: 'hook', text: hook }), false);
  assert.equal(clipMatches(hookClip, word, { kind: 'definition', text: hook }), false);
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

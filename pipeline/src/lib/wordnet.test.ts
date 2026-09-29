import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  partsOfSpeechOf,
  isOffensive,
  findWordToken,
  formatDefinition,
  indexSensesBySynset,
  lemmaFromSenseKey,
  lookupWord,
  type OewnEntries,
  type OewnSynsets,
  type WordNetData,
} from './wordnet.ts';
import { parseDatamuseTags } from './datamuse.ts';
import { tiersByFrequencyRank } from './difficulty.ts';

const LIMITS = { maxSenses: 3, maxExamplesPerSense: 2, maxRelationsPerType: 6 };

// A tiny slice of WordNet in the release's JSON shape.
const entries: OewnEntries = {
  ephemeral: {
    a: {
      pronunciation: [
        { value: 'ɪˈfɛm(ə)ɹəl', variety: 'GB' },
        { value: 'əˈfɛm(ə)ɹəl', variety: 'US' },
      ],
      sense: [{ id: 'ephemeral%5:00:00:impermanent:00', synset: '1-s' }],
    },
    n: { sense: [{ id: 'ephemeral%1:05:00::', synset: '2-n' }] },
  },
  impermanent: {
    a: {
      sense: [{ id: 'impermanent%3:00:00::', synset: '3-a', antonym: ['permanent%3:00:00::'] }],
    },
  },
  censure: {
    n: { sense: [{ id: 'censure%1:10:00::', synset: '4-n' }] },
    v: { sense: [{ id: 'censure%2:32:00::', synset: '5-v' }] },
  },
  abate: {
    v: { sense: [{ id: 'abate%2:30:00::', synset: '6-v' }] },
  },
};

const synsets: OewnSynsets = {
  '1-s': {
    definition: ['lasting a very short time'],
    example: ['the ephemeral joys of childhood', 'a passing fancy', 'ephemeral fame'],
    members: ['ephemeral', 'passing', 'short-lived', 'transient'],
    partOfSpeech: 's',
    similar: ['3-a'],
  },
  '2-n': {
    definition: ['anything short-lived'],
    members: ['ephemeron', 'ephemeral'],
    partOfSpeech: 'n',
  },
  '3-a': {
    definition: ['not permanent; not lasting'],
    members: ['impermanent', 'temporary'],
    partOfSpeech: 'a',
  },
  '4-n': {
    definition: ['harsh criticism or disapproval'],
    members: ['censure', 'animadversion'],
    partOfSpeech: 'n',
  },
  '5-v': {
    definition: ['rebuke formally'],
    example: [{ text: 'The senate censured the member', source: 'test' }],
    members: ['censure', 'reprimand'],
    partOfSpeech: 'v',
  },
  '6-v': {
    definition: ['become less in amount or intensity'],
    example: ['The storm abated', 'The rain let up after a few hours', 'abating fury'],
    members: ['abate', 'let up', 'slack off'],
    partOfSpeech: 'v',
  },
};

const data: WordNetData = { entries, synsets, sensesBySynset: indexSensesBySynset(entries) };

test('formatDefinition capitalizes and ends with a period', () => {
  assert.equal(formatDefinition('lasting a very short time'), 'Lasting a very short time.');
  assert.equal(formatDefinition('already done.'), 'Already done.');
});

test('lemmaFromSenseKey reads the lemma before the %', () => {
  assert.equal(lemmaFromSenseKey('permanent%3:00:00::'), 'permanent');
  assert.equal(lemmaFromSenseKey('let_up%2:30:00::'), 'let up');
});

test('findWordToken finds the word and its inflections, not other words', () => {
  assert.equal(findWordToken('The storm abated', 'abate'), 'abated');
  assert.equal(findWordToken('abating fury', 'abate'), 'abating');
  assert.equal(findWordToken('Ephemeral fame', 'ephemeral'), 'Ephemeral');
  assert.equal(findWordToken('a passing fancy', 'ephemeral'), null);
  assert.equal(findWordToken('an abstraction', 'abstract'), null);
});

test('lookupWord keeps only examples that use the headword', () => {
  const r = lookupWord(data, 'ephemeral', ['adjective'], LIMITS)!;
  assert.equal(r.partOfSpeech, 'adjective');
  assert.deepEqual(r.senses, [
    {
      definition: 'Lasting a very short time.',
      examples: [
        { text: 'The ephemeral joys of childhood', clozeTarget: 'ephemeral' },
        { text: 'Ephemeral fame', clozeTarget: 'Ephemeral' },
      ],
    },
  ]);
});

test('lookupWord prefers the US pronunciation', () => {
  assert.equal(lookupWord(data, 'ephemeral', [], LIMITS)!.ipa, '/əˈfɛm(ə)ɹəl/');
});

test('lookupWord takes synonyms from the synset and antonyms through the head adjective', () => {
  const r = lookupWord(data, 'ephemeral', ['adjective'], LIMITS)!;
  assert.deepEqual(r.synonyms, ['passing', 'short-lived', 'transient']);
  assert.deepEqual(r.antonyms, ['permanent']);
});

test('lookupWord follows the preferred part of speech and keeps only its senses', () => {
  const asVerb = lookupWord(data, 'censure', ['verb', 'noun'], LIMITS)!;
  assert.equal(asVerb.partOfSpeech, 'verb');
  assert.deepEqual(
    asVerb.senses.map((s) => s.definition),
    ['Rebuke formally.'],
  );
  assert.equal(asVerb.senses[0]!.examples[0]!.clozeTarget, 'censured');
  const asNoun = lookupWord(data, 'censure', ['noun'], LIMITS)!;
  assert.equal(asNoun.partOfSpeech, 'noun');
});

test('lookupWord falls back to the part of speech with the most senses', () => {
  assert.equal(lookupWord(data, 'ephemeral', [], LIMITS)!.partOfSpeech, 'adjective');
});

test('lookupWord respects the example limit and returns null for unknown words', () => {
  const r = lookupWord(data, 'abate', [], { ...LIMITS, maxExamplesPerSense: 1 })!;
  assert.equal(r.senses[0]!.examples.length, 1);
  assert.equal(lookupWord(data, 'nonexistent', [], LIMITS), null);
});

test('parseDatamuseTags reads frequency and parts of speech in order', () => {
  assert.deepEqual(parseDatamuseTags(['n', 'v', 'f:1.98']), {
    frequency: 1.98,
    partsOfSpeech: ['noun', 'verb'],
  });
  assert.deepEqual(parseDatamuseTags(['adj', 'u']), { frequency: null, partsOfSpeech: ['adjective'] });
});

test('isOffensive drops vulgar lemmas by whole word only', () => {
  for (const bad of ['ass-kisser', 'bastardly', 'retarded', 'niggardliness']) {
    assert.equal(isOffensive(bad), true, bad);
  }
  for (const ok of ['assuage', 'cockle', 'assiduous', 'scrap', 'dickens']) {
    assert.equal(isOffensive(ok), false, ok);
  }
});

test('tiersByFrequencyRank splits the list into five equal groups, common first', () => {
  const words = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, frequency_rank: 100 - i }));
  const tiers = tiersByFrequencyRank([...words, { id: 99, frequency_rank: null }]);
  assert.equal(tiers.get(10), 1, 'most common word');
  assert.equal(tiers.get(1), 5, 'rarest word');
  assert.deepEqual(
    [...tiers.values()].sort().join(''),
    '1122334455',
  );
  assert.equal(tiers.has(99), false, 'unranked words keep their tier');
});

test('partsOfSpeechOf lists every part of speech a base form has', () => {
  assert.deepEqual(partsOfSpeechOf(data, 'censure')!.sort(), ['noun', 'verb']);
  assert.deepEqual(partsOfSpeechOf(data, 'ephemeral')!.sort(), ['adjective', 'noun']);
  assert.equal(partsOfSpeechOf(data, 'abated'), null, 'inflected forms are not entries');
});

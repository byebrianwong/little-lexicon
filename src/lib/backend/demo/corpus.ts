// A compact, hand-curated erudite corpus for demo mode and tests. The real
// corpus (thousands of words) is produced by the Phase 1 pipeline and seeded
// into Postgres; this bundled set exists so the app is fully playable with no
// backend. Definitions are concise and original to avoid share-alike text.

export interface SeedExample {
  text: string;
  cloze: string; // the token to blank
}

export interface SeedSense {
  def: string;
  plain: string;
  register?: string;
  examples: SeedExample[];
  distractors: string[]; // wrong definitions for multiple choice
}

export interface SeedWord {
  headword: string;
  pos: string;
  ipa: string;
  syllables: number;
  difficultyTier: number; // 1..5
  frequencyRank: number;
  etymology: string;
  senses: SeedSense[];
  synonyms: string[];
  antonyms: string[];
  mnemonic: string;
}

export const CORPUS: SeedWord[] = [
  {
    headword: 'ephemeral',
    pos: 'adjective',
    ipa: '/ɪˈfɛm(ə)rəl/',
    syllables: 4,
    difficultyTier: 3,
    frequencyRank: 9200,
    etymology: 'From Greek ephemeros, lasting only a day.',
    senses: [
      {
        def: 'Lasting for a very short time.',
        plain: 'Here and gone fast; short-lived.',
        register: 'literary',
        examples: [
          { text: 'The ephemeral beauty of cherry blossoms drew crowds for a single week.', cloze: 'ephemeral' },
          { text: 'Fame in that industry proved ephemeral, fading within a season.', cloze: 'ephemeral' },
          { text: 'She photographed the ephemeral morning fog before it burned away.', cloze: 'ephemeral' },
        ],
        distractors: [
          'Lasting a very long time.',
          'Extremely loud or harsh.',
          'Relating to money and trade.',
        ],
      },
    ],
    synonyms: ['fleeting', 'transient', 'transitory', 'evanescent'],
    antonyms: ['permanent', 'enduring', 'lasting'],
    mnemonic: 'Ephemeral sounds like "a femoral" pulse: it beats once and is gone.',
  },
  {
    headword: 'quixotic',
    pos: 'adjective',
    ipa: '/kwɪkˈsɒtɪk/',
    syllables: 3,
    difficultyTier: 4,
    frequencyRank: 14800,
    etymology: 'From Don Quixote, the idealistic knight of Cervantes.',
    senses: [
      {
        def: 'Extremely idealistic and impractical.',
        plain: 'Chasing grand dreams that are not realistic.',
        examples: [
          { text: 'His quixotic plan to end all traffic with free bicycles charmed but convinced no one.', cloze: 'quixotic' },
          { text: 'They admired her quixotic devotion to lost causes.', cloze: 'quixotic' },
          { text: 'A quixotic startup can burn through money chasing an impossible market.', cloze: 'quixotic' },
        ],
        distractors: [
          'Cautious and highly practical.',
          'Quick to anger over small things.',
          'Relating to chemistry experiments.',
        ],
      },
    ],
    synonyms: ['idealistic', 'impractical', 'utopian', 'starry-eyed'],
    antonyms: ['pragmatic', 'realistic', 'practical'],
    mnemonic: 'Quixotic comes from Quixote, who tilted at windmills thinking they were giants.',
  },
  {
    headword: 'laconic',
    pos: 'adjective',
    ipa: '/ləˈkɒnɪk/',
    syllables: 3,
    difficultyTier: 4,
    frequencyRank: 15600,
    etymology: 'From Laconia (Sparta), whose people were famously terse.',
    senses: [
      {
        def: 'Using very few words.',
        plain: 'Says a lot with almost nothing.',
        examples: [
          { text: 'His laconic reply, just "fine," ended the conversation.', cloze: 'laconic' },
          { text: 'The laconic sergeant issued orders in three-word bursts.', cloze: 'laconic' },
          { text: 'Her laconic emails never wasted a syllable.', cloze: 'laconic' },
        ],
        distractors: [
          'Speaking at great, tiresome length.',
          'Full of wild exaggeration.',
          'Relating to lakes and rivers.',
        ],
      },
    ],
    synonyms: ['terse', 'concise', 'curt', 'succinct'],
    antonyms: ['verbose', 'loquacious', 'garrulous'],
    mnemonic: 'A laconic person would rather lack words than waste them.',
  },
  {
    headword: 'obfuscate',
    pos: 'verb',
    ipa: '/ˈɒbfʌskeɪt/',
    syllables: 3,
    difficultyTier: 4,
    frequencyRank: 17200,
    etymology: 'From Latin obfuscare, to darken.',
    senses: [
      {
        def: 'To deliberately make something unclear.',
        plain: 'To muddy the water on purpose.',
        examples: [
          { text: 'The report seemed designed to obfuscate rather than explain the losses.', cloze: 'obfuscate' },
          { text: 'Jargon can obfuscate a simple idea until no one understands it.', cloze: 'obfuscate' },
          { text: 'He tried to obfuscate the timeline so no single day looked bad.', cloze: 'obfuscate' },
        ],
        distractors: [
          'To make something perfectly clear.',
          'To clean a surface thoroughly.',
          'To celebrate a public holiday.',
        ],
      },
    ],
    synonyms: ['obscure', 'muddle', 'cloud', 'befog'],
    antonyms: ['clarify', 'illuminate', 'elucidate'],
    mnemonic: 'Obfuscate hides an "obscure fuss" that leaves everyone confused.',
  },
  {
    headword: 'sycophant',
    pos: 'noun',
    ipa: '/ˈsɪkəfant/',
    syllables: 3,
    difficultyTier: 4,
    frequencyRank: 18100,
    etymology: 'From Greek sykophantes, an informer or flatterer.',
    senses: [
      {
        def: 'A person who flatters powerful people to gain advantage.',
        plain: 'A suck-up who praises the boss for favors.',
        examples: [
          { text: 'The new manager surrounded himself with sycophants who never disagreed.', cloze: 'sycophant' },
          { text: 'A good adviser tells the truth; a sycophant tells you what you want to hear.', cloze: 'sycophant' },
          { text: 'She saw through the sycophant angling for a promotion.', cloze: 'sycophant' },
        ],
        distractors: [
          'A person who criticizes everyone harshly.',
          'A doctor who studies the mind.',
          'A musician who plays alone.',
        ],
      },
    ],
    synonyms: ['flatterer', 'toady', 'bootlicker', 'yes-man'],
    antonyms: ['critic', 'detractor'],
    mnemonic: 'A sycophant is sickeningly fawning around anyone in charge.',
  },
  {
    headword: 'pragmatic',
    pos: 'adjective',
    ipa: '/præɡˈmatɪk/',
    syllables: 3,
    difficultyTier: 2,
    frequencyRank: 5400,
    etymology: 'From Greek pragma, a deed or thing done.',
    senses: [
      {
        def: 'Dealing with things practically rather than idealistically.',
        plain: 'Focused on what actually works.',
        examples: [
          { text: 'She took a pragmatic approach and shipped the simplest fix first.', cloze: 'pragmatic' },
          { text: 'Being pragmatic, they chose the cheaper tool that solved the problem.', cloze: 'pragmatic' },
          { text: 'A pragmatic budget accounts for the money you actually have.', cloze: 'pragmatic' },
        ],
        distractors: [
          'Guided by unrealistic dreams.',
          'Easily frightened or nervous.',
          'Relating to ancient history.',
        ],
      },
    ],
    synonyms: ['practical', 'sensible', 'realistic', 'down-to-earth'],
    antonyms: ['idealistic', 'impractical', 'quixotic'],
    mnemonic: 'A pragmatic person asks the practical question: does it work?',
  },
  {
    headword: 'ubiquitous',
    pos: 'adjective',
    ipa: '/juːˈbɪkwɪtəs/',
    syllables: 4,
    difficultyTier: 3,
    frequencyRank: 8700,
    etymology: 'From Latin ubique, everywhere.',
    senses: [
      {
        def: 'Present or found everywhere.',
        plain: 'Seemingly everywhere at once.',
        examples: [
          { text: 'Smartphones are now ubiquitous, from boardrooms to playgrounds.', cloze: 'ubiquitous' },
          { text: 'Coffee shops became ubiquitous on every downtown corner.', cloze: 'ubiquitous' },
          { text: 'The ubiquitous logo appeared on shirts, cups, and billboards.', cloze: 'ubiquitous' },
        ],
        distractors: [
          'Extremely rare and hard to find.',
          'Loud and unpleasant to hear.',
          'Related to underwater life.',
        ],
      },
    ],
    synonyms: ['omnipresent', 'pervasive', 'universal'],
    antonyms: ['rare', 'scarce', 'uncommon'],
    mnemonic: 'Ubiquitous: you bic (a pen) is everywhere in every drawer.',
  },
  {
    headword: 'capricious',
    pos: 'adjective',
    ipa: '/kəˈprɪʃəs/',
    syllables: 3,
    difficultyTier: 3,
    frequencyRank: 11200,
    etymology: 'From Italian capriccio, a sudden whim.',
    senses: [
      {
        def: 'Given to sudden, unpredictable changes of mood or behavior.',
        plain: 'Changes its mind on a whim.',
        examples: [
          { text: 'The capricious weather swung from sun to hail within the hour.', cloze: 'capricious' },
          { text: 'A capricious manager who reverses decisions daily exhausts a team.', cloze: 'capricious' },
          { text: 'Markets can be capricious, rewarding patience one week and punishing it the next.', cloze: 'capricious' },
        ],
        distractors: [
          'Steady, reliable, and predictable.',
          'Extremely generous with money.',
          'Relating to farming and crops.',
        ],
      },
    ],
    synonyms: ['fickle', 'mercurial', 'volatile', 'whimsical'],
    antonyms: ['steady', 'consistent', 'constant'],
    mnemonic: 'A capricious goat (Capricorn) leaps in whatever direction it fancies.',
  },
  {
    headword: 'pernicious',
    pos: 'adjective',
    ipa: '/pəˈnɪʃəs/',
    syllables: 3,
    difficultyTier: 4,
    frequencyRank: 13400,
    etymology: 'From Latin perniciosus, destructive.',
    senses: [
      {
        def: 'Having a harmful effect, especially in a gradual or subtle way.',
        plain: 'Quietly does real damage over time.',
        examples: [
          { text: 'The pernicious rumor spread slowly and ruined her reputation.', cloze: 'pernicious' },
          { text: 'Small, pernicious habits can undermine years of savings.', cloze: 'pernicious' },
          { text: 'The software had a pernicious bug that corrupted data unnoticed.', cloze: 'pernicious' },
        ],
        distractors: [
          'Helpful and health-giving.',
          'Bright and cheerful.',
          'Relating to the ocean.',
        ],
      },
    ],
    synonyms: ['harmful', 'destructive', 'insidious', 'noxious'],
    antonyms: ['beneficial', 'benign', 'harmless'],
    mnemonic: 'Pernicious harm is a "purse-vicious" thief, quietly draining you.',
  },
  {
    headword: 'gregarious',
    pos: 'adjective',
    ipa: '/ɡrɪˈɡɛːrɪəs/',
    syllables: 4,
    difficultyTier: 3,
    frequencyRank: 10100,
    etymology: 'From Latin gregarius, belonging to a flock (grex).',
    senses: [
      {
        def: 'Fond of company; sociable.',
        plain: 'Loves being around other people.',
        examples: [
          { text: 'A gregarious host, he knew everyone at the party by name.', cloze: 'gregarious' },
          { text: 'Gregarious animals like wolves live and hunt in groups.', cloze: 'gregarious' },
          { text: 'Her gregarious nature made the office feel welcoming.', cloze: 'gregarious' },
        ],
        distractors: [
          'Preferring to be alone.',
          'Quick to lose one’s temper.',
          'Skilled at mathematics.',
        ],
      },
    ],
    synonyms: ['sociable', 'outgoing', 'convivial', 'affable'],
    antonyms: ['reclusive', 'solitary', 'introverted'],
    mnemonic: 'A gregarious person joins the group (Latin grex) every time.',
  },
  {
    headword: 'insidious',
    pos: 'adjective',
    ipa: '/ɪnˈsɪdɪəs/',
    syllables: 4,
    difficultyTier: 4,
    frequencyRank: 12600,
    etymology: 'From Latin insidiae, an ambush.',
    senses: [
      {
        def: 'Proceeding in a gradual, subtle way, but with harmful effects.',
        plain: 'Sneaks up on you and then it is bad.',
        examples: [
          { text: 'The disease is insidious, showing no symptoms until it is advanced.', cloze: 'insidious' },
          { text: 'Insidious flattery slowly clouded his judgment.', cloze: 'insidious' },
          { text: 'There is an insidious cost to skipping small maintenance for years.', cloze: 'insidious' },
        ],
        distractors: [
          'Open, obvious, and easy to spot.',
          'Warm and comforting.',
          'Relating to islands.',
        ],
      },
    ],
    synonyms: ['stealthy', 'subtle', 'treacherous', 'pernicious'],
    antonyms: ['obvious', 'overt', 'harmless'],
    mnemonic: 'An insidious plan lies in ambush (insidiae) until it is too late.',
  },
  {
    headword: 'eloquent',
    pos: 'adjective',
    ipa: '/ˈɛləkwənt/',
    syllables: 3,
    difficultyTier: 2,
    frequencyRank: 6100,
    etymology: 'From Latin eloqui, to speak out.',
    senses: [
      {
        def: 'Fluent and persuasive in speech or writing.',
        plain: 'Speaks or writes in a moving, convincing way.',
        examples: [
          { text: 'Her eloquent speech moved the whole room to applause.', cloze: 'eloquent' },
          { text: 'He made an eloquent case for saving the old library.', cloze: 'eloquent' },
          { text: 'The essay was short but eloquent, every line earning its place.', cloze: 'eloquent' },
        ],
        distractors: [
          'Awkward and unclear in expression.',
          'Extremely wealthy.',
          'Relating to electricity.',
        ],
      },
    ],
    synonyms: ['articulate', 'persuasive', 'fluent', 'expressive'],
    antonyms: ['inarticulate', 'halting', 'tongue-tied'],
    mnemonic: 'Someone eloquent can elope with your agreement using words alone.',
  },
];

export function corpusHeadwords(): string[] {
  return CORPUS.map((w) => w.headword);
}

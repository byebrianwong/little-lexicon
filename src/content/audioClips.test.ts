// Every exported word and example sentence must have a bundled clip.
//
// The pipeline export (stage 05) lists only clips made from the current text
// and IPA, so a sentence rewritten or a pronunciation fixed without remaking
// its clip shows up here as missing. Both files are read as text: Jest swaps
// out the clip module (jest.setup.ts) and does not load MP3s.

import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { WordsFile } from '@/lib/content';

const CONTENT = __dirname;
const REMAKE = 'From pipeline/, run `npx tsx src/run.ts --only=audio`, then `--only=export`.';

/** Clip ids and the files they require, from one section of audioClips.ts. */
function clipsIn(section: string): Map<number, string> {
  const clips = new Map<number, string>();
  for (const [, id, path] of section.matchAll(/^ {2}(\d+): require\('([^']+)'\),$/gm)) {
    if (id && path) clips.set(Number(id), path);
  }
  return clips;
}

const words = (JSON.parse(readFileSync(join(CONTENT, 'words.json'), 'utf8')) as WordsFile).words;
const source = readFileSync(join(CONTENT, 'audioClips.ts'), 'utf8');
const split = source.indexOf('export const sentenceClips');
const wordClips = clipsIn(source.slice(0, split));
const sentenceClips = clipsIn(source.slice(split));

function assertNone(problems: string[], what: string): void {
  if (problems.length > 0) {
    throw new Error(`${problems.length} ${what}, for example ${problems.slice(0, 5).join('; ')}. ${REMAKE}`);
  }
}

describe('bundled audio clips', () => {
  it('reads both sections of the clip module', () => {
    expect(split).toBeGreaterThan(0);
    expect(wordClips.size).toBeGreaterThan(0);
    expect(sentenceClips.size).toBeGreaterThan(0);
  });

  it('has a clip for every word', () => {
    assertNone(
      words.filter((w) => !wordClips.has(w.wordId)).map((w) => `${w.headword} (${w.wordId})`),
      'words have no clip',
    );
  });

  it('has a clip for every example sentence', () => {
    const missing = words.flatMap((w) =>
      w.senses.flatMap((s) =>
        s.examples
          .filter((e) => !sentenceClips.has(e.exampleId))
          .map((e) => `${w.headword} example ${e.exampleId}`),
      ),
    );
    assertNone(missing, 'example sentences have no clip');
  });

  it('points every clip at a file that exists', () => {
    const absent = [...wordClips.values(), ...sentenceClips.values()].filter(
      (path) => !existsSync(resolve(CONTENT, path)),
    );
    assertNone(absent, 'clip files are missing');
  });
});

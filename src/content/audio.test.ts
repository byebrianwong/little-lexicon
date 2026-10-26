// Every exported word and example sentence must have a clip on the site.
//
// The pipeline export (stage 05) gives an audioUrl only to clips made from the
// current text and IPA, so a sentence rewritten or a pronunciation fixed
// without remaking its clip shows up here as missing. The URL's hash must
// match the file, or the app would keep a stale download.

import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { WordsFile } from '@/lib/content';

const ROOT = join(__dirname, '..', '..');
const REMAKE = 'From pipeline/, run `npx tsx src/run.ts --only=audio`, then `--only=export`.';
const URL_SHAPE = /^audio\/((?:words|sentences)\/\d+\.mp3)\?v=([0-9a-f]{12})$/;

const words = (JSON.parse(readFileSync(join(__dirname, 'words.json'), 'utf8')) as WordsFile).words;
const clips = words.flatMap((w) => [
  { name: `${w.headword} (${w.wordId})`, url: w.audioUrl },
  ...w.senses.flatMap((s) =>
    s.examples.map((e) => ({ name: `${w.headword} example ${e.exampleId}`, url: e.audioUrl })),
  ),
]);

function assertNone(problems: string[], what: string): void {
  if (problems.length > 0) {
    throw new Error(`${problems.length} ${what}, for example ${problems.slice(0, 5).join('; ')}. ${REMAKE}`);
  }
}

describe('pronunciation clips', () => {
  it('gives every word and example sentence an audioUrl', () => {
    expect(clips.length).toBeGreaterThan(0);
    assertNone(
      clips.filter((c) => !c.url).map((c) => c.name),
      'words or sentences have no clip',
    );
  });

  it('points every audioUrl at a file in public/audio with a matching hash', () => {
    const problems: string[] = [];
    for (const { name, url } of clips) {
      if (!url) continue;
      const match = URL_SHAPE.exec(url);
      if (!match) {
        problems.push(`${name}: unexpected audioUrl ${url}`);
        continue;
      }
      const [, path = '', hash] = match;
      const file = join(ROOT, 'public', 'audio', path);
      if (!existsSync(file)) {
        problems.push(`${name}: no file ${path}`);
        continue;
      }
      const actual = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12);
      if (actual !== hash) problems.push(`${name}: ${path} changed after export`);
    }
    assertNone(problems, 'clips do not match their files');
  });
});

# Little Lexicon content pipeline

Offline, build-time pipeline that produces the words the app teaches. It runs
on a developer machine or in CI and writes two files:

- `data/content-db.json`: the pipeline's record. Every word, sense, example,
  relation, mnemonic and distractor row, with its id. Committed.
- `../src/content/words.json`: the words file the app bundles. Generated from
  the record by the export stage. Committed.

The app never calls the sources below at runtime, so per-user cost for paid
APIs is near zero (SPEC.md sections 2 and 5).

This directory is self-contained: its own `package.json`, its own `.env`, and no
shared source with the app.

## Word ids are permanent

Saved progress refers to words by id, so an id must never change or be reused.

- New words get the next id from a counter in the record. Ids only go up.
- The export compares the new words file with the one already in the app. If a
  headword would get a different id, or an id a different headword, it stops
  and writes nothing.
- A word removed from the seed list keeps its row and id in the record. If a
  word stops being exported, the export warns and its id stays retired.
- To stop teaching a word, set `"retired": "<reason>"` on its row in the
  record and take it out of the seed list. The export, the difficulty tiers and
  `curate.ts` skip retired words. The row, its content and its id stay, so the
  word can come back by removing the field.
- Never delete `data/content-db.json` once the app has shipped. A fresh record
  would number words from 1 again, and the export would refuse it.

## Stages

The pipeline runs five stages in order. Each is idempotent and can be run alone
with `--only=<stage>`.

| `--only` | Stage file | What it does |
| --- | --- | --- |
| `words` | `src/stages/01-ingest-words.ts` | Load the seed list, dedupe, lowercase-normalize, drop proper-noun candidates and multi-word entries, and add new words to the record. Then re-tier the whole list by Datamuse frequency into five equal groups, so every tier has words. |
| `senses` | `src/stages/02-hydrate.ts` | From Open English WordNet: up to 3 definitions, dictionary examples that use the headword, synonyms, antonyms, and a US pronunciation. Datamuse's most common part of speech decides which part of speech's senses are kept. Vulgar and slur synonyms are dropped. |
| `generate` | `src/stages/03-generate.ts` | Per sense a plain-language definition, 3-5 example sentences with cloze targets, 4-6 distractors (wrong definitions, for multiple choice), and one mnemonic per word. Claude Batch API when `ANTHROPIC_API_KEY` is set; otherwise Gemini when `GEMINI_API_KEY` is set (eight senses per request, saved as each returns). Zod-validated before any write. Skipped with neither key. |
| `audio` | `src/stages/04-audio.ts` | An MP3 for every headword and example sentence of the taught words, saved under `assets/audio` (`words/<id>.mp3`, `sentences/<id>.mp3`), which the app bundles. Headwords use a US human recording from the Free Dictionary API when there is one; everything else is spoken by Kokoro, an open voice model that runs on this computer, with the word's IPA pinning how it says the headword. Skipped when the Kokoro env is missing (see [Audio](#audio)). |
| `export` | `src/stages/05-export.ts` | Build `src/content/words.json` from the whole record, check ids against the existing file, and report the size. Also write `src/content/audioClips.ts`, which requires every clip so Metro bundles it. A clip whose sentence or IPA changed after it was made is left out (the app uses the device's speech for it) until `audio` runs again. |

A word WordNet does not have gets no senses, is left out of the export, and is
logged. Stages never fill real files with stub text.

## Improving entries without an API key

Word entries are reviewed and improved inside a Claude Code session: the
session's model writes and scores the content, and these commands pick the
words, check the work and apply it. The process and the scoring rubric are in
`.claude/skills/improve-words/SKILL.md`.

```bash
npx tsx src/curate.ts status                 # what is reviewed, what is left
npx tsx src/curate.ts next --count=12        # write a worksheet to out/curate/
npx tsx src/curate.ts next --count=100 --split=8   # 8 worksheets for a big run
npx tsx src/curate.ts check <worksheet...>   # run the fixed checks, on several together
npx tsx src/curate.ts apply <worksheet>      # write the record, export words.json
```

Every review is stored in the record's `reviews` table with its scores. The
Gemini stages (`generate`, `revise`) skip reviewed words.

## How to run

```bash
cd pipeline
npm install

# Unit tests plus an offline dry run: no keys, no network, no spend.
npm test

# Full offline dry-run over the whole seed list. Writes out/ only.
npx tsx src/run.ts --dry-run

# Live run. Free stages always run; paid stages run when their key is set.
npm start                     # tsx src/run.ts, all stages
npx tsx src/run.ts --only=generate       # one stage
npx tsx src/run.ts --only=export         # re-export after editing the record

# Typecheck.
npm run build                 # tsc --noEmit
```

After changing content (a `curate.ts apply` or `ipa`, or new words), run
`npx tsx src/run.ts --only=audio`, then `--only=export`, so the clips match the
new text.

The first live run downloads Open English WordNet (about 10 MB zipped, 80 MB
unpacked) into `.cache/oewn`, checks its SHA-256, and unpacks it with the
`unzip` command.

### Flags

- `--dry-run` Offline mode: bundled seed list, deterministic stub generators,
  and output to `out/dry-run.json` and `out/words.dry-run.json`. Stub content is
  labeled `(dry-run stub)`.
- `--only=<words|senses|generate|audio|export>` Run a single stage. Stages
  assume the earlier ones have already produced their rows.
- `--limit=N` Process at most N words this run. The export always covers the
  whole record.
- `-v` / `--verbose` Debug logging.

## Configuration

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored (root
`.gitignore`: `pipeline/.env`). These are server-side keys and must never reach
the app bundle or any `EXPO_PUBLIC_*` variable (CLAUDE.md > Secrets).

- `ANTHROPIC_API_KEY` - Claude batch generation (stage 03).
- `GEMINI_API_KEY` - Gemini generation (stage 03), used only when there is no
  Anthropic key. Each request tries `gemini-3.8-flash`, then `gemini-3.7-flash`,
  then `gemini-3.5-flash-lite`; set `GEMINI_MODEL` to a comma-separated list to
  change that. Free-tier limits depend on the Google project, and a model can
  answer 503 "high demand" for minutes while an older one works. Requests go
  one at a time and back off on HTTP 429 or 5xx. If no model answers, or every
  model's daily quota is spent, the stage stops with its progress saved and the
  next run continues. Generated rows record `source: 'gemini'`.
- `KOKORO_VOICE` (optional) - the voice for stage 04, default `af_heart`.
  The voices are listed at
  https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md. Changing the
  voice remakes every TTS clip on the next run.
- `KOKORO_PYTHON` (optional) - the Kokoro env's Python, default
  `~/.cache/little-lexicon-tts/.venv/bin/python`.

Stage 04 needs no key. It needs the Kokoro env described under [Audio](#audio).

Datamuse and WordNet need no key.

## Audio

Stage 04 speaks the words and sentences with Kokoro-82M
(https://huggingface.co/hexgrad/Kokoro-82M), an open text-to-speech model under
the Apache 2.0 license, so its clips can ship in the app. It runs on this
computer's CPU through `tools/kokoro-tts.py`. There is no account, key or
charge. On an Apple M5 a full run of 3,162 clips took 30 minutes, after 3.5
minutes of Free Dictionary lookups. Clips average about 20 KB.

Set it up once (macOS):

```bash
brew install uv
uv venv --python 3.12 ~/.cache/little-lexicon-tts/.venv
uv pip install --python ~/.cache/little-lexicon-tts/.venv/bin/python \
  -r tools/kokoro-requirements.txt
```

The env takes about 900 MB, mostly PyTorch. The first run also downloads the
model (about 330 MB) into the Hugging Face cache, `~/.cache/huggingface`. The
model is pinned to one commit in `tools/kokoro-tts.py`.

Keep the env at a short path. Kokoro uses espeak-ng to spell words that are
missing from its dictionary, and espeak-ng cuts the path of its data folder at
160 characters. An env inside a worktree or a temp folder can pass that limit;
the script then stops and says so.

How it says each word:

- The word's IPA from the words file is turned into Kokoro's phoneme letters
  (`ipaToKokoro` in `src/lib/audio.ts`) and pinned in the text with Kokoro's
  markup, `[abate](/əbˈAt/)`. This applies to the headword clip and to the
  headword wherever a sentence uses it as written or capitalized. Inflected
  forms ("abated") are left to Kokoro's own dictionary.
- Without the pin, Kokoro gets some words wrong, for example "banal" as
  "BAY-nul" and "debacle" as "day-BAH-kul".
- Clips are 32 kbps mono MP3s at 24 kHz.

## Idempotency

Re-running is safe and cheap. Each stage checks the record and only fills gaps:

- `words`: an existing headword is skipped and keeps its id.
- `senses`: a word that already has senses is skipped.
- `generate`: a sense that already has its plain definition, three or more
  generated examples, and four or more distractors is skipped; a word that
  already has a mnemonic gets no new one.
- `audio`: each clip records a key made from its text, the word's IPA and the
  voice. A clip is made again only when that key changes (a rewritten
  sentence, a fixed IPA, a new voice). Clips whose word or sentence is gone or
  retired are deleted, except on a `--limit` run.

Datamuse responses are cached under `.cache/` by URL. Only successful and
"not found" answers are cached, so a server error is retried on the next run.

## Cost model

Costs are one-time and small (SPEC.md sections 6 and 7). The summary printed at
the end of every run reports token counts, characters synthesized, dollar
estimates, and the words file size.

- **Claude generation.** `claude-haiku-4-5` for bulk ($1 in / $5 out per 1M
  tokens); items that fail validation twice escalate to `claude-sonnet-5`. The
  Batch API is 50% off, and the shared instruction prefix is prompt-cached. The
  dry-run estimate for the 317-word sample is well under a dollar.
- **Text to speech: Kokoro, run locally.** Free. The cost is time (about half
  an hour for a full run) and app size: the clips are bundled, so the summary
  reports their total. Human pronunciations from the Free Dictionary API are
  used for headwords when a US recording exists.
- **Words file size.** 317 words with dictionary content only: 439 KB as
  written, 41 KB compressed. Generated content will add to that; the export
  reports the new size.

## Data sources and licensing

- Seed word list: public GRE/erudite aggregations (treated as seeds, not
  authoritative). A ~320-word sample ships at `data/seed-words.sample.txt`.
- Frequency and part-of-speech order: Datamuse (free; build-time only).
- Definitions, examples, synonyms, antonyms, pronunciations: Open English
  WordNet 2025 (https://en-word.net/), CC BY 4.0. The words file carries the
  credit line and the app shows it on the Settings screen. Provenance is stored
  in the `source` column of every relation and example row.
- Human headword audio: US recordings from Wikimedia Commons, found through
  the Free Dictionary API, stage 04 only. They are CC BY-SA. Each clip's
  source page and license are kept in the record (`audio_objects`), and when
  any is bundled the export adds a credit line to the words file, which the
  Settings screen shows.
- Claude-generated content (sentences, distractors, mnemonics, plain
  definitions) is owned outright.

## Layout

```
pipeline/
  data/seed-words.sample.txt   seed list (~320 words)
  data/content-db.json         the record: every row and id (committed)
  src/run.ts                   orchestrator (flags, stage sequencing, summary)
  src/config.ts                env + flags + RunContext + metrics
  src/stages/                  01-ingest-words, 02-hydrate, 03-generate, 04-audio, 05-export
  src/lib/                     store, wordnet, datamuse, exportContent, audio, schema (zod),
                               fetch, stubs, difficulty, logger, types, *.test.ts
  out/                         dry-run output (git-ignored)
  tools/kokoro-tts.py          speaks stage 04's clips with Kokoro (Python)
  tools/kokoro-requirements.txt  exact packages for the Kokoro env
  tools/*.py                   other helpers: word frequency, dictionary definitions
  .cache/                      WordNet download, Datamuse responses, clips in progress (git-ignored)
```

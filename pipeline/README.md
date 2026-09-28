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
| `audio` | `src/stages/04-audio.ts` | TTS every headword and example sentence to MP3 under `out/audio`. Not uploaded, and no `audio_url` is set, until an audio host is chosen. Skipped without `GOOGLE_TTS_API_KEY`. |
| `export` | `src/stages/05-export.ts` | Build `src/content/words.json` from the whole record, check ids against the existing file, and report the size. |

A word WordNet does not have gets no senses, is left out of the export, and is
logged. Stages never fill real files with stub text.

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
  Anthropic key. Optional `GEMINI_MODEL` (default `gemini-3.8-flash`). Free-tier
  rate limits depend on the Google project: requests go one at a time, back off
  on HTTP 429, and a daily quota stops the stage with its progress saved, so the
  next run continues.
- `GOOGLE_TTS_API_KEY` - text to speech (stage 04). Optional overrides:
  `GOOGLE_TTS_VOICE`, `GOOGLE_TTS_LANGUAGE`.

Datamuse and WordNet need no key.

## Idempotency

Re-running is safe and cheap. Each stage checks the record and only fills gaps:

- `words`: an existing headword is skipped and keeps its id.
- `senses`: a word that already has senses is skipped.
- `generate`: a sense that already has its plain definition, three or more
  generated examples, and four or more distractors is skipped; a word that
  already has a mnemonic gets no new one.
- `audio`: a clip already in the record is never re-synthesized.

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
- **TTS provider: Google Cloud Text-to-Speech (Neural2).** About 1M free Neural2
  characters a month, then about $16 per 1M characters. Human pronunciations
  from the Free Dictionary API are reused for headwords when available.
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
- Human headword audio: the Free Dictionary API (Wiktionary-sourced), stage 04
  only.
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
  src/lib/                     store, wordnet, datamuse, exportContent, schema (zod),
                               fetch, stubs, difficulty, logger, types, *.test.ts
  out/                         dry-run output and synthesized audio (git-ignored)
  .cache/                      WordNet download and Datamuse responses (git-ignored)
```

# Little Lexicon content pipeline

Offline, build-time pipeline that produces the word corpus and seeds Supabase
for the Little Lexicon app. It runs on a developer machine or in CI, writes to Supabase
once, and is not part of the app runtime. Per-user runtime cost for paid APIs is
therefore near zero (SPEC.md sections 2 and 5).

This directory is self-contained: its own `package.json`, its own `.env`, and no
shared source with the app.

## Stages

The pipeline runs four stages in order. Each is idempotent and can be run alone
with `--only=<stage>`.

| `--only` | Stage file | What it does |
| --- | --- | --- |
| `words` | `src/stages/01-ingest-words.ts` | Load the seed list, dedupe, lowercase-normalize, drop proper-noun candidates and multi-word entries, assign `difficulty_tier` (1..5) from frequency, insert `little_lexicon.words`. |
| `senses` | `src/stages/02-hydrate.ts` | Pull definitions, part of speech, synonyms, antonyms, and real example sentences; write `little_lexicon.senses`, `little_lexicon.word_relations`, and `little_lexicon.example_sentences` (`is_generated=false`). Source recorded per row. |
| `generate` | `src/stages/03-generate.ts` | Claude Batch API: per sense a plain-language definition, 3-5 erudite example sentences with cloze targets, 4-6 distractors, and one global mnemonic per word. Zod-validated before any write. |
| `audio` | `src/stages/04-audio.ts` | TTS every headword and example sentence to MP3, upload to the `little-lexicon-audio` bucket at deterministic paths, write public URLs back. |

## How to run

```bash
cd pipeline
npm install

# Offline self-test: no keys, no network, no spend. Writes out/dry-run.json.
npm test                      # tsx src/run.ts --dry-run --limit=20

# Full offline dry-run over the whole bundled seed list.
npx tsx src/run.ts --dry-run

# Live run (needs pipeline/.env with real keys):
npm start                     # tsx src/run.ts, all stages
npx tsx src/run.ts --only=audio          # one stage
npx tsx src/run.ts --limit=500           # first 500 words only

# Typecheck.
npm run build                 # tsc --noEmit
```

### Flags

- `--dry-run` Force offline mode: bundled seed list, deterministic stub
  generators, and writes to `pipeline/out/dry-run.json` instead of Supabase. No
  API keys and no network are required. Stub content is labeled `(dry-run stub)`.
- `--only=<words|senses|generate|audio>` Run a single stage. Stages assume the
  earlier ones have already produced their rows.
- `--limit=N` Process at most N words this run. Useful for smoke tests and for
  chunking a large corpus.
- `-v` / `--verbose` Debug logging.

If `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are absent, the pipeline
automatically falls into dry-run even without `--dry-run`, so it never fails for
lack of credentials.

## Configuration

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored (root
`.gitignore`: `pipeline/.env`). Every value here is server-side only and must
never reach the app bundle or any `EXPO_PUBLIC_*` variable (CLAUDE.md > Secrets).

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` - the service role bypasses RLS to
  write the content tables.
- `ANTHROPIC_API_KEY` - Claude batch generation (stage 03).
- `GOOGLE_TTS_API_KEY` - text to speech (stage 04). Optional overrides:
  `GOOGLE_TTS_VOICE`, `GOOGLE_TTS_LANGUAGE`, `STORAGE_BUCKET`.

## Idempotency

Re-running is safe and cheap. Each stage checks for existing rows and only fills
gaps:

- `words`: an existing headword is skipped.
- `senses`: a word that already has senses is skipped.
- `generate`: a sense already has its plain definition, three or more generated
  examples, and four or more distractors is skipped; a word that already has a
  global mnemonic gets no new one.
- `audio`: a word or sentence that already has an `audio_url` is skipped, so no
  clip is ever re-synthesized.

The same existence checks back both the Supabase store and the dry-run JSON
store, so running the dry-run twice produces byte-for-byte the same row counts
and no duplicates.

## Cost model

Costs are one-time and small (SPEC.md sections 6 and 7). The summary printed at
the end of every run reports token counts, characters synthesized, dollar
estimates, and bucket size.

- **Claude generation.** `claude-haiku-4-5` for bulk ($1 in / $5 out per 1M
  tokens); items that fail validation twice escalate to `claude-sonnet-5`
  ($2 / $10 intro). The Batch API is 50% off, and the shared instruction prefix
  is prompt-cached (cached input bills at about 10% of the input rate). For
  roughly 8,000 words this is a few million output tokens, on the order of tens
  of dollars.
- **TTS provider: Google Cloud Text-to-Speech (Neural2).** Chosen for a generous
  monthly free tier (about 1M Neural2 characters/month, which can cover the whole
  one-time corpus if spread across billing months), direct MP3 output, and simple
  API-key auth on the REST `text:synthesize` endpoint (no service-account JSON).
  List price past the free tier is about $16 per 1M characters. The whole corpus
  (about 8,000 headwords plus a few sentences each) is a few million characters,
  so tens of dollars at most, often free. Human pronunciations from the Free
  Dictionary API are reused for headwords when available as MP3, which lowers the
  synthesized character count.
- **Storage.** The `little-lexicon-audio` bucket is tracked per run. The pipeline flags at
  0.9 GB, before the shared ~1 GB Supabase free-tier limit, and recommends a
  dedicated bucket or external object store at that point.

## Data sources and licensing

- Seed word list: public GRE/erudite aggregations (treated as seeds, not
  authoritative). A ~320-word sample ships at `data/seed-words.sample.txt` so a
  dry-run needs no network.
- Frequency and distractor candidates: Datamuse (free; build-time only).
- Definitions, synonyms, antonyms, examples: the Free Dictionary API
  (`dictionaryapi.dev`, Wiktionary-sourced, CC BY-SA) in the current live path.
  Open English WordNet is the intended primary backbone for cleaner licensing;
  bundling its data export and preferring it over the API is the documented
  follow-up. Provenance is stored in the `source` column of every relation and
  example row.
- Wiktionary-derived verbatim text is share-alike. Owning the Claude-generated
  derived content (sentences, distractors, mnemonics, plain definitions) keeps
  the runtime free of share-alike dependencies.

## Layout

```
pipeline/
  data/seed-words.sample.txt   bundled sample seed list (~320 words)
  src/run.ts                   orchestrator (flags, stage sequencing, summary)
  src/config.ts                env + flags + RunContext + metrics
  src/stages/                  01-ingest-words, 02-hydrate, 03-generate, 04-audio
  src/lib/                     supabase client, store, schema (zod), fetch, stubs,
                               difficulty, logger, types
  out/dry-run.json             dry-run output (git-ignored)
  .cache/                      cached Datamuse / Free Dictionary responses (git-ignored)
```

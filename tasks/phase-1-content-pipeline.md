# Phase 1: Content and Audio Pipeline

Build the offline pipeline that produces the word corpus and seeds Supabase. This is standalone Node code, not part of the app. It shares no runtime source with the app, so it can run as its own sub-agent track in parallel with Phases 2 and 3.

**Depends on:** Phase 0.2 (schema applied, Storage bucket, service-role key).
**Splittable:** yes. 1.1 to 1.3 are a sequential content chain; 1.4 (audio) is independent once 1.1 to 1.2 have produced words and sentences. Split content and audio across two agents.

Put all of this under `pipeline/` (its own `package.json`, its own git-ignored `.env` with `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and the TTS key). The pipeline writes with the service role and bypasses RLS.

## 1.1 Ingest and curate the word list

- Pull one or more public GRE/erudite seed lists (for example https://github.com/Xatta-Trone/gre-words-collection). Treat them as seeds.
- Deduplicate, lowercase-normalize headwords, drop proper nouns and multi-word entries unless intentionally kept.
- Assign an initial `difficulty_tier` (1 to 5) using frequency (rarer = harder). Get frequency from Datamuse (`https://api.datamuse.com/words?sp=<word>&md=f`) or an ngram frequency list. Ref: https://www.datamuse.com/api/
- Target roughly 3,000 to 8,000 words. Insert into `little_lexicon.words` (headword, part_of_speech, frequency_rank, difficulty_tier).

**Acceptance:** `little_lexicon.words` populated with the target count, no duplicates, every row has a difficulty_tier.

## 1.2 Hydrate senses, relations, examples

- For each word, pull definitions, part of speech, synonyms, antonyms, and example sentences from Open English WordNet (backbone) and fill gaps from the Free Dictionary API (https://dictionaryapi.dev/, sources Wiktionary, CC BY-SA). Refs: https://github.com/globalwordnet/english-wordnet
- Write `little_lexicon.senses` (definition, sense_order, register), `little_lexicon.word_relations` (synonym/antonym/hypernym), and seed `little_lexicon.example_sentences` from any real examples found (mark `source` accordingly, `is_generated=false`).
- Respect licensing: keep attribution metadata for WordNet; be aware Wiktionary-derived verbatim text is share-alike.

**Acceptance:** every word has at least one sense; most words have at least one relation and one example; sources recorded per row.

## 1.3 Claude batch generation

Generate what the free sources lack, using the Anthropic Batch API. Refs: https://docs.claude.com/en/docs/build-with-claude/batch-processing and prompt caching https://docs.claude.com/en/docs/build-with-claude/prompt-caching

- Model: `claude-haiku-4-5` for bulk. Escalate specific weak items to `claude-sonnet-5` only where Haiku output is poor.
- Generate per sense: a plain-language definition, 3 to 5 natural erudite example sentences (with a `cloze_target` token marked per sentence), 4 to 6 plausible distractors, and one global mnemonic per word.
- Prompt for JSON only. Parse defensively: strip code fences, validate with Zod, reject and retry malformed rows rather than inserting them.
- Use the Batch API (50% off) and cache the shared instruction prefix. Keep a stable prefix across items so caching applies.
- Write results to `little_lexicon.senses.plain_language_definition`, `little_lexicon.example_sentences` (`source='claude'`, `is_generated=true`), `little_lexicon.distractors`, and `little_lexicon.mnemonics` (global, `user_id` null).

**Acceptance:** every sense has a plain-language definition and at least 3 example sentences with cloze targets; every sense has at least 4 distractors; every word has at least one mnemonic; a Zod validation report shows zero invalid rows inserted. Log the total token spend.

## 1.4 Audio generation and upload

- Choose a TTS provider by cost and quality (see `SPEC.md` section 6). Prefer free human headword audio surfaced by the Free Dictionary API where present; use TTS for coverage and all sentence audio.
- Pre-generate MP3s for every headword and every example sentence. Do not generate audio at runtime.
- Upload to the `little-lexicon-audio` bucket with deterministic paths (for example `words/<word_id>.mp3`, `sentences/<sentence_id>.mp3`). Write the public URL back to `little_lexicon.words.audio_url` and `little_lexicon.example_sentences.audio_url`.
- Track total bucket size. If it approaches ~1 GB (shared free-tier limit), flag it and propose a dedicated bucket or external object store before continuing.

**Acceptance:** every word and every example sentence has a reachable `audio_url` that plays; the pipeline logs total characters synthesized, provider cost, and total bucket size.

## 1.5 Re-runnability

- The pipeline must be idempotent: re-running skips words/senses/audio that already exist and only fills gaps. Provide a `--only=<words|senses|generate|audio>` flag so stages run independently.

**Acceptance:** running the full pipeline twice does not create duplicates and does not re-spend on already-generated content.

## Definition of done

All acceptance criteria above, plus the shared checklist in `CLAUDE.md`. Append a Phase 1 note to `PROGRESS.md`: final word count, per-stage token/character/dollar spend, TTS provider chosen, and total bucket size.

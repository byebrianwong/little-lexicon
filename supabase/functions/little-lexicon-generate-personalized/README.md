# little-lexicon-generate-personalized

Phase 6.4. Generates a mnemonic or example sentence tuned to a learner's
interests. Gated runtime Claude call.

## Request

`POST /functions/v1/little-lexicon-generate-personalized`

Headers:

- `Authorization: Bearer <supabase user access token>`
- `Content-Type: application/json`

Body:

```json
{
  "wordId": 123,
  "headword": "abate",
  "definition": "Make less active or intense.",
  "kind": "mnemonic",
  "interests": ["climbing", "jazz"]
}
```

- `wordId`: a positive integer, the word's id in the app's words file
  (`src/content/words.json`). It is stored with a personalized mnemonic.
- `headword`: the word on screen. Letters, spaces, hyphens and apostrophes,
  at most 40 characters.
- `definition`: the definition on screen (the plain-language one when the
  word has it). At most 400 characters. Line breaks become spaces.
- `kind`: `"mnemonic"` or `"sentence"`.
- `interests`: strings. The first five non-empty ones are used, trimmed.

Word content ships in the app, not in Postgres, so the function does not look
the word up. It uses the headword and definition it is given. `request.ts`
checks them, and a request that fails the check returns 400 before it counts
against the daily cap.

## Response

Mnemonic (also persisted to `little_lexicon.mnemonics` with `user_id` set, owner-only):

```json
{ "kind": "mnemonic", "id": 456, "text": "..." }
```

Sentence (returned only, never written to shared content):

```json
{ "kind": "sentence", "text": "..." }
```

## Gating and limits

- Auth: bearer JWT via `getUser()`; missing/invalid returns 401.
- Rate limit: `little_lexicon.bump_ai_usage('generate')`, `DAILY_CAP` 30, over the cap
  returns 429 (increment-first / fail-closed).
- Model: `claude-haiku-4-5`, rubric cached with `cache_control`.
- Body checked by `parseGenRequest` in `request.ts` (unit tested in
  `request.test.ts`, which the app's Jest run picks up).

Personalized mnemonics are inserted with the caller's `user_id`, so RLS keeps
them visible only to that user. Personalized sentences are not written to the
shared `example_sentences` table.

## Required secrets (Deno.env)

- `ANTHROPIC_API_KEY` (set via `supabase secrets set`)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
  (auto-injected)

## Deploy

```bash
supabase functions deploy little-lexicon-generate-personalized
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

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
{ "wordId": 123, "kind": "mnemonic", "interests": ["climbing", "jazz"] }
```

`kind` is `"mnemonic"` or `"sentence"`.

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
- Pro only: `profiles.is_pro` read with a service-role client; non-Pro returns
  403.
- Rate limit: `little_lexicon.bump_ai_usage('generate')`, `DAILY_CAP` 30, over the cap
  returns 429 (increment-first / fail-closed).
- Model: `claude-haiku-4-5`, rubric cached with `cache_control`.
- Word and sense content are read with the caller's client (content-read RLS).

Personalized mnemonics are inserted with the caller's `user_id`, so RLS keeps
them visible only to that user. Personalized sentences are not written to the
shared `example_sentences` table.

## Required secrets (Deno.env)

- `ANTHROPIC_API_KEY` (set via `supabase secrets set`)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  (auto-injected)

## Deploy

```bash
supabase functions deploy little-lexicon-generate-personalized
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

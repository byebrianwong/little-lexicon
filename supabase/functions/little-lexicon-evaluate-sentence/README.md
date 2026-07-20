# little-lexicon-evaluate-sentence

Phase 4.4 "Use it" mode. Evaluates a sentence the learner wrote using a target
word and returns short feedback. This is a gated runtime Claude call.

## Request

`POST /functions/v1/little-lexicon-evaluate-sentence`

Headers:

- `Authorization: Bearer <supabase user access token>`
- `Content-Type: application/json`

Body:

```json
{ "wordId": 123, "headword": "ephemeral", "sentence": "The mist was ephemeral." }
```

## Response

```json
{ "correct": true, "feedback": "Good use.", "suggestion": "" }
```

If the model returns something unparseable, the function degrades to a neutral
result instead of failing:

```json
{ "correct": null, "feedback": "Saved.", "logged": true }
```

## Gating and limits

- Auth: the caller is identified from the bearer JWT via `getUser()`. Missing or
  invalid token returns 401.
- Pro only: `profiles.is_pro` is read with a service-role client. Non-Pro
  returns 403. The client-side flag is never trusted.
- Rate limit: `little_lexicon.bump_ai_usage('evaluate')` increments a per-user daily
  counter. Over `DAILY_CAP` (30) returns 429. The counter is incremented before
  the paid call (fail-closed), so bursts are throttled.
- Model: `claude-haiku-4-5`, rubric cached with `cache_control`.

## Required secrets (Deno.env)

- `ANTHROPIC_API_KEY` (set via `supabase secrets set`)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  (auto-injected in the Supabase Functions runtime)

No secret is ever returned to the client.

## Deploy

```bash
supabase functions deploy little-lexicon-evaluate-sentence
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

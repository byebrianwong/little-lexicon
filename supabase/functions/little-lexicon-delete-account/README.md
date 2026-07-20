# little-lexicon-delete-account

Deletes the authenticated user and, by cascade, all of their per-user rows.

## Request

`POST` with the caller's Supabase JWT in `Authorization: Bearer <token>`. Empty body.

## Behavior

1. Identify the caller from their JWT (`getUser()`). No user, 401.
2. Delete that user with the service role (`auth.admin.deleteUser`). The
   `on delete cascade` foreign keys to `auth.users` remove the user's rows in
   `little_lexicon.profiles`, `user_word_state`, `review_logs`, `game_sessions`,
   `daily_stats`, `achievements`, and any personalized `mnemonics`.
3. Content tables (`words`, `senses`, `example_sentences`, `word_relations`,
   `distractors`, global `mnemonics`) are never touched.

A user can only ever delete their own account: the id comes from the verified
JWT, never from the request body.

## Secrets (Deno.env)

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy

```
supabase functions deploy little-lexicon-delete-account
```

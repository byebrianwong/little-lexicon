# little-lexicon-revenuecat-webhook

Phase 7.2. Server-side entitlement. RevenueCat calls this webhook on
subscription lifecycle events; it sets `little_lexicon.profiles.is_pro` so entitlement is
decided on the server, never by a client flag.

## Request

`POST /functions/v1/little-lexicon-revenuecat-webhook`

Headers:

- `Authorization: <REVENUECAT_WEBHOOK_SECRET>` (the exact shared-secret value
  configured in the RevenueCat dashboard, sent as the full Authorization header)

Body: the RevenueCat event JSON (`{ "event": { "type": ..., "app_user_id": ... } }`).

## Behavior

- Bad or missing secret returns 401.
- `is_pro = true` on `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`,
  `PRODUCT_CHANGE`.
- `is_pro = false` on `EXPIRATION` only.
- `CANCELLATION` is acknowledged but makes no change: it means auto-renew was
  turned off while access continues to the end of the paid period, at which
  point `EXPIRATION` fires and revokes Pro.
- Any other event, or an `app_user_id` that is not a UUID, returns 200 and makes
  no change (acknowledged so RevenueCat does not retry).
- Updates run with a service-role client.

`app_user_id` must be the Supabase auth user id. Configure the app to call
`Purchases.logIn(session.user.id)` so RevenueCat sends the right id.

## Required secrets (Deno.env)

- `REVENUECAT_WEBHOOK_SECRET` (set via `supabase secrets set`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected)

## Deploy

RevenueCat cannot send a Supabase JWT, so deploy without JWT verification and
rely on the shared secret:

```bash
supabase functions deploy little-lexicon-revenuecat-webhook --no-verify-jwt
supabase secrets set REVENUECAT_WEBHOOK_SECRET=<random-long-string>
```

Then set the webhook URL and the same secret in the RevenueCat dashboard.

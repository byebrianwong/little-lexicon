# Store data-safety disclosure

Mapping of what the App collects, for the Apple privacy nutrition label and the
Google Play Data safety form. Keep this in sync with docs/PRIVACY.md.

## Data collected and linked to the user

| Data type | Collected | Linked to identity | Purpose | Optional |
| --- | --- | --- | --- | --- |
| Email address | Yes | Yes | Account, authentication | No |
| Display name | Yes | Yes | Profile, leaderboard | Yes |
| App activity (reviews, streak, XP, stats) | Yes | Yes | App functionality | No |
| Purchase history / entitlement | Yes | Yes | Provide Pro features | Yes |
| User-generated content (sentence you write for evaluation) | Yes | Yes | AI feedback feature, on request | Yes |

## Data NOT collected

- Precise or coarse location
- Contacts, photos, messages, browsing history
- Advertising identifiers
- Health, financial account, or biometric data

## Handling

- **Encryption in transit:** Yes (HTTPS to Supabase and the AI provider).
- **Deletion:** Users can delete their account in-app (Settings, Account).
- **Third parties:**
  - Supabase (database, auth, storage): processor for account and learning data.
  - RevenueCat and the app stores: purchase processing.
  - Anthropic: receives only the specific text of an AI feature request, on user
    action, for Pro users.
- **Data sold:** No.
- **Data used for tracking across apps/sites:** No.

## Runtime AI calls

Only two features make runtime AI calls, both Pro-gated, rate-limited, and
routed through a server function that holds the API key (never the client):
sentence evaluation and personalized content generation. All other content is
pre-generated at build time and cached, so ordinary use makes no AI calls.

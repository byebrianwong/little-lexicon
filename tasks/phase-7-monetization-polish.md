# Phase 7: Monetization, Polish, and Ship

Add the paywall, offline support, account handling, and store submission.

**Depends on:** all prior phases.
**Splittable:** 7.1 to 7.2 (payments) and 7.3 to 7.5 (polish/ship) can be two tracks.

## 7.1 Subscriptions with RevenueCat

- Define the Pro entitlement and products (monthly and annual). Build a paywall.
- Enforce free-tier limits: capped new words per day and core modes only. Pro unlocks unlimited words, all game modes, advanced stats, offline audio, and the Claude-powered features.
- Ref: https://www.revenuecat.com/docs/

**Acceptance:** a free user hits the daily cap and sees the paywall; a purchase unlocks Pro features on native; entitlement persists across reinstall via RevenueCat.

## 7.2 Server-side entitlement

- Add a RevenueCat webhook to a `little-lexicon-*` Edge Function that sets `profiles.is_pro`. Gate server-side features (sentence evaluation, personalized generation) on `is_pro`, not on a client flag alone.

**Acceptance:** the webhook flips `is_pro` on purchase and expiry; server features check `is_pro`; a client that fakes the flag still cannot reach gated Edge Functions.

## 7.3 Offline support

- Cache audio and the near-term due queue for offline sessions. Queue review commits made offline and sync on reconnect without double-counting.

**Acceptance:** a session runs airplane-mode after a warm start; queued reviews sync once on reconnect; no duplicate log rows.

## 7.4 Account management

- Add profile editing, data export, and account deletion. Deletion must remove the user's rows (the `on delete cascade` foreign keys handle child rows once the auth user is deleted). No hard-deletes of other users' or content data.

**Acceptance:** deletion removes all of the user's per-user rows and leaves content tables intact; export returns the user's own data.

## 7.5 Store readiness

- App icons, splash, screenshots, store listings, privacy policy, and a privacy-nutrition/data-safety disclosure covering auth, purchases, and any runtime AI calls.
- Production EAS Build and Submit for iOS and Android. Set up EAS Update for OTA JS updates. Refs: https://docs.expo.dev/submit/introduction/ and https://docs.expo.dev/eas-update/introduction/

**Acceptance:** production builds pass store validation; listings and privacy disclosures are complete; an OTA update reaches an installed build.

## Definition of done

All acceptance criteria above, plus the shared checklist in `CLAUDE.md`. Append a Phase 7 note to `PROGRESS.md`: product IDs, entitlement flow, offline-sync approach, and any store-review notes.

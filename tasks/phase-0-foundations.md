# Phase 0: Foundations

Scaffold the app, backend, and CI so later phases have a stable base.

**Depends on:** nothing.
**Can run in parallel with:** nothing (this unblocks everything else).
**Splittable:** tasks 0.1 and 0.2 can run concurrently by two agents; 0.3 to 0.5 need both.

## 0.1 App scaffold

- Create an Expo app with TypeScript (strict) and Expo Router configured for iOS, Android, and web output.
- Add NativeWind, Zustand, TanStack Query, and set up the folder layout from `CLAUDE.md` (`app/`, `src/lib`, `src/features`, `src/components`, `src/srs`).
- Add a placeholder home route that renders on all three platforms.

**Acceptance:** `npx expo start` runs; the home route loads on iOS simulator, Android emulator, and web. `tsc --noEmit` and lint pass.

## 0.2 Supabase wiring

- Create the `little_lexicon` schema and all tables by applying `supabase/migrations/0001_init_little_lexicon_schema.sql` to the shared `games-apps` project.
- Create the `little-lexicon-audio` Storage bucket (public read, service-role write).
- Add the Supabase client in `src/lib/supabase.ts` using `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Configure it for React Native (AsyncStorage session persistence, per Expo + Supabase guide: https://docs.expo.dev/guides/using-supabase/).
- Generate types: `supabase gen types typescript --schema little_lexicon` into `src/lib/database.types.ts` and commit.

**Acceptance:** migration applies cleanly; a smoke query against `little_lexicon.words` returns (empty is fine) without an RLS or permission error for an authenticated test user; `database.types.ts` is committed.

## 0.3 Auth

- Implement email sign-up/sign-in and at least one OAuth provider.
- Confirm the `on_auth_user_created` trigger creates a `little_lexicon.profiles` row on sign-up.
- Add an auth-gated layout: unauthenticated users see sign-in; authenticated users reach the app shell.

**Acceptance:** a new sign-up creates exactly one `profiles` row; sign-out and sign-in work on native and web.

## 0.4 CI and environment

- Add CI that runs typecheck, lint, and tests on every push.
- Document `.env` variables in `.env.example` (client-safe only). Confirm no server secret is referenced from app code.
- Configure EAS Build for iOS and Android (dev build profile is enough here). Ref: https://docs.expo.dev/build/introduction/

**Acceptance:** CI is green on the base branch; `.env.example` lists only `EXPO_PUBLIC_*`.

## 0.5 RevenueCat stub

- Install `react-native-purchases` and initialize it behind a feature flag that is off by default. No products or paywall yet.

**Acceptance:** the app builds with the SDK present and the flag off; no purchase UI appears.

## Definition of done

All acceptance criteria above, plus the shared checklist in `CLAUDE.md`. Append a Phase 0 note to `PROGRESS.md` with the Supabase project ref, bucket name, and any deviations.

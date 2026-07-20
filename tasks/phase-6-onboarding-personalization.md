# Phase 6: Onboarding and Personalization

Get new users to the right starting level quickly and tailor content lightly.

**Depends on:** Phases 3 to 5.
**Splittable:** 6.1 and 6.2 are one flow; 6.3 and 6.4 are independent add-ons.

## 6.1 Adaptive placement

- On first run, run a short placement: show words spanning difficulty tiers and ask "know it / not sure / don't know." Use responses to set `profiles.level_estimate` and to mark clearly-known words with `is_known=true` so they are skipped from the new-word queue.
- Keep it short (a couple dozen words), adjusting difficulty based on answers rather than a fixed list.

**Acceptance:** placement sets a level estimate and marks known words; the new-word queue afterward starts near the estimated level, not at tier 1.

## 6.2 Goals and interests

- Ask for a daily goal and a few interests (stored in `profiles.interests`). Interests feed personalized sentence themes and mnemonics later; for now just capture them.

**Acceptance:** goal and interests persist to `profiles`; the home screen reflects the chosen goal.

## 6.3 Notifications

- Add opt-in daily reminders (local notifications) timed to the user's usual session time or a chosen time. Respect permission state and a setting to turn them off. Ref: https://docs.expo.dev/versions/latest/sdk/notifications/

**Acceptance:** reminders fire when enabled, do not fire when disabled, and handle a denied permission gracefully.

## 6.4 Personalized content (optional, gated)

- Allow generating a mnemonic or example sentence tuned to a user's interests on demand. This is a runtime Claude call, so gate it (Pro, rate-limited, via `little-lexicon-*` Edge Function, key server-side). Store personalized mnemonics in `little_lexicon.mnemonics` with `user_id` set.

**Acceptance:** personalized items are owner-visible only (RLS), generated server-side, rate-limited, and never call Claude from the client.

## Definition of done

All acceptance criteria above, plus the shared checklist in `CLAUDE.md`. Append a Phase 6 note to `PROGRESS.md`: the placement approach and how known-word skipping interacts with the new-word queue.

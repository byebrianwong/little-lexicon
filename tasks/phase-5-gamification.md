# Phase 5: Gamification and Progress

Add the engagement layer and progress views. Build the anti-gaming rules in from the start so engagement stays tied to learning.

**Depends on:** Phases 3 and 4 (sessions produce reviews and XP).
**Splittable:** 5.1 to 5.3 (engagement) and 5.4 to 5.5 (progress views) can be two tracks.

## 5.1 XP weighted by retrieval difficulty

- Define an XP table keyed by game mode: production and "use it" award the most, cloze and synonym/antonym in the middle, multiple choice and matching the least. Bonus for first-attempt and speed.
- Apply it in the review commit so `game_sessions.xp_earned`, `daily_stats.xp`, and `profiles.xp_total` reflect it. Add levels as a function of `xp_total`.

**Acceptance:** the same word answered via production yields more XP than via multiple choice; totals aggregate correctly across a session and day.

## 5.2 Streaks with limited freeze

- Increment `streak_count` when the day's goal is met (`daily_stats.goal_met`). Reset on a missed day unless a streak freeze is spent. Cap freezes.
- Streak credit requires genuine review completion toward the goal, not trivial taps. Do not award streak or goal credit for opening the app or skipping items.

**Acceptance:** meeting the goal advances the streak once per day; a missed day without a freeze resets it; a freeze prevents one reset; no path awards credit without completed reviews.

## 5.3 Daily goal and weekly leaderboard

- Let the user set `daily_goal`. Show progress toward it in the session and home screens.
- Weekly segmented leaderboard: group users into small cohorts and rank by weekly XP (a materialized view or scheduled aggregate over `daily_stats`). Segmenting avoids demoralizing lower-XP users.

**Acceptance:** the goal is adjustable and reflected everywhere; the leaderboard shows the user's cohort and updates on the weekly boundary.

## 5.4 Progress and stats

- Build a stats screen: words known / learning / due counts, overall retention percentage (from `review_logs`), current streak, XP and level.
- Calendar heatmap of activity from `daily_stats`.
- A review forecast: count of cards due per upcoming day from `user_word_state.due`.

**Acceptance:** counts match the underlying tables; the heatmap and forecast render on native and web; retention percentage is computed from logged reviews, not guessed.

## 5.5 Achievements and feedback polish

- Add a small set of achievements (first 100 words, 7-day streak, a perfect session). Add immediate positive feedback (sound and a brief animation) on correct answers, respecting a mute setting.

**Acceptance:** achievements unlock on their real conditions; feedback can be muted; animations do not block the next item.

## 5.6 Settings: desired retention

- Expose `desired_retention` (0.80 to 0.95) in settings. Changing it rebuilds the scheduler for future reviews. Explain the tradeoff in one plain sentence (higher retention means more reviews).

**Acceptance:** changing the value affects subsequent scheduling; existing cards are not retroactively corrupted.

## Definition of done

All acceptance criteria above, plus the shared checklist in `CLAUDE.md`. Append a Phase 5 note to `PROGRESS.md`: the XP table, streak/freeze rules, and how the leaderboard is aggregated.

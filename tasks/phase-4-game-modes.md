# Phase 4: Additional Game Modes

Add the higher-retrieval and audio-focused modes. Each mode is a self-contained component that takes a card and returns a `GameOutcome`, so these are highly parallelizable.

**Depends on:** Phase 3 (session runner and outcome plumbing).
**Splittable:** yes. Each mode below can be a separate sub-agent task. Keep a shared `GameMode` interface so the session runner can slot any of them in.

Shared contract: every mode is a component `({ card, content }) => renders UI, calls onOutcome(outcome: GameOutcome)`. Register each mode with the session runner and add it to the escalation ladder in `SPEC.md` section 1.

## 4.1 Production (type the word)

- Prompt with the definition, or a synonym, or "the word that means X." User types the word. Highest retrieval demand, so highest XP.
- Accept exact match and a small edit-distance tolerance; do not accept a synonym as the target.

**Acceptance:** correct spelling passes, near-miss typos pass, wrong words fail; assigned the highest XP weight.

## 4.2 Synonym / antonym match

- Show the word and a set of candidates; user selects the synonym(s) or antonym(s) from `little_lexicon.word_relations`, mixed with distractors.

**Acceptance:** correct relations are scored right; distractors are plausible; supports both synonym and antonym prompts.

## 4.3 Listening mode

- Play the word or a sentence audio with no text, then ask the user to pick or type the word. Exercises the audio channel directly.

**Acceptance:** audio plays first with the word hidden; both recognition and typed variants work; falls back gracefully if a clip is missing.

## 4.4 Use it (write a sentence, optional Claude evaluation)

- User writes their own sentence using the word. This is a production task and earns the highest XP tier.
- Evaluation is a runtime Claude call, so it is gated: Pro-only, routed through an Edge Function `little-lexicon-evaluate-sentence` that holds the API key server-side, with a per-user rate limit. Use `claude-haiku-4-5` with prompt caching on the rubric. Never call Claude from the client.
- Return concise feedback: is the usage correct, and one suggestion. Store nothing sensitive.

**Acceptance:** free users see the mode gated or hidden; Pro users get feedback within a rate limit; the API key is not present in the client bundle; malformed model output degrades to a neutral "logged" result rather than crashing.

## 4.5 Speed round

- A timed lightning round over near-due cards using quick recognition modes, for streak and XP. Time pressure only; no new scheduling behavior beyond normal review commits.

**Acceptance:** the round runs on a timer, commits reviews normally, and reports XP and accuracy.

## Definition of done

All acceptance criteria above, plus the shared checklist in `CLAUDE.md`. Append a Phase 4 note to `PROGRESS.md`: the `GameMode` interface, the modes shipped, and the escalation ladder now in effect.

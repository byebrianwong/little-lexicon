# Phase 3: Learning Loop and First Game Modes

Build the playable daily session with the first two game modes. This is the first end-to-end learning experience.

**Depends on:** Phase 1 (seeded content) and Phase 2 (scheduling and review commit).
**Splittable:** 3.2 (multiple choice) and 3.3 (cloze) can be built concurrently once 3.1 exists.

## 3.1 Session runner

- Build a session screen that assembles a queue: due reviews from `getDueQueue` interleaved with new words from `getNewWords`, capped by the daily goal.
- For each item, pick a game mode based on the card's `state` and `reps` (see the escalation ladder in `SPEC.md` section 1). In this phase, new/early cards use multiple choice and learning cards use cloze.
- On each answer, measure response time and hint use, call `submitReview`, then advance. Show correct/incorrect feedback with the correct answer and the word's audio.
- End the session with a summary (words seen, accuracy, XP earned as a simple count for now).

**Acceptance:** a user can complete a full session; every answer produces a review commit; the queue respects the daily cap; audio plays on each reveal.

## 3.2 Word introduction screen

- When a new word first appears, show a compact intro before quizzing: headword, part of speech, IPA, plain-language definition, one example sentence, and a tappable audio control. Optionally show one mnemonic.
- Keep it brief per `CLAUDE.md` copy rules.

**Acceptance:** new words show the intro once; audio plays; the screen renders on native and web.

## 3.3 Multiple choice mode

- Present the word (or its audio) and four options: the correct definition plus three distractors (pull from `little_lexicon.distractors`; fall back to other senses' definitions if short).
- Definition-to-word and word-to-definition variants.
- Award lower XP than production modes (see Phase 5 for the XP weighting; use a constant now and wire the weighting later).

**Acceptance:** options render with one correct answer and valid distractors; selecting maps to a correct/incorrect outcome; works from both text and audio prompts.

## 3.4 Cloze mode

- Show an example sentence with the target word blanked (use `example_sentences.cloze_target`). The user types the missing word (accept minor typos via a small edit-distance tolerance) or picks from options for an easier variant.
- Show the full sentence and play its audio on reveal.

**Acceptance:** the blank is correctly derived from `cloze_target`; typed answers accept exact and near-exact matches; sentence audio plays on reveal.

## 3.5 Audio playback module

- Add `src/lib/audio.ts` using `expo-av` (or `expo-audio`) to play word and sentence MP3s from Storage, with a preload for the next item to avoid a gap.

**Acceptance:** audio plays on iOS, Android, and web without a noticeable delay between items on the happy path.

## Definition of done

All acceptance criteria above, plus the shared checklist in `CLAUDE.md`. Append a Phase 3 note to `PROGRESS.md`: the mode-selection rule used per card state, and the typo-tolerance approach for cloze/production.

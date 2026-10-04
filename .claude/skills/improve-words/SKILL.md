---
name: improve-words
description: Review and improve Little Lexicon's word entries (dictionary definition, plain definition, example sentences, quiz wrong answers, memory hook, synonyms and antonyms) inside a Claude Code session, with no paid API. Use when asked to improve, review, fix or curate word content, or when a word shows wrong or weak content in the app.
---

# Improve word entries

You are the writer and the judge. You read a worksheet of word entries, score
each one against the rubric below, rewrite what scores under 4, and hand the
worksheet back. Tools in `pipeline/` pick the words, check your work against
fixed rules, and write it into the record.

This costs nothing beyond the Claude Code session. Do not call the Claude or
Gemini APIs, and do not ask for an API key. (The pipeline's Gemini stages are an
older, separate path. They skip any word curated here.)

## The loop

Run these from `pipeline/` (run `npm ci` there first if `node_modules` is
missing).

1. `npx tsx src/curate.ts status` shows how many words are reviewed, the flagged
   ones, and the most common problems in the rest.
2. `npx tsx src/curate.ts next --count=12` writes a worksheet to
   `pipeline/out/curate/` and prints its path. Words that give the answer away
   come first. Use `--words=derivative,capricious` to pick words by name.
3. Edit the worksheet. For each word:
   - Read `problems`. These are what the fixed checks found in the current
     content. All of them must be gone before you apply.
   - Score the current content on every criterion in the rubric.
   - Rewrite every field that scores under 4. Then score the content as it now
     stands.
   - Fill in `review.scores`, `review.verdict` and `review.notes`.
4. `npx tsx src/curate.ts check <worksheet>` runs the checks. Fix and repeat
   until every word says `ok`.
5. `npx tsx src/curate.ts apply <worksheet>` writes the record
   (`pipeline/data/content-db.json`) and exports `src/content/words.json`. It
   writes nothing if any word fails.
6. From the repo root, run `npx jest src/lib/content` to check the exported
   file. Commit the record and the words file together, and list the words in
   the commit message.

Worksheets of 10 to 15 words work well. For a big run, split the words into
several worksheets and give each one to a subagent (the Agent tool) to edit.
Only the main session runs `check` and `apply`, one worksheet at a time, so two
runs never write the record at once. A later `apply` can fail because an
earlier one took a wrong answer it also uses; change it and check again.

## What the app shows

Score with these screens in mind:

| Field | Where it appears |
| --- | --- |
| `plain` | New-word card, browse list, answer reveal, and the prompt of "which word means...". |
| `definition` | The correct option of "what does this word mean?", beside 3 wrong answers. Also the fallback when `plain` is empty. |
| `examples` | The first one on the new-word card and in reveals. Any one in the cloze game, with the word blanked out. |
| `wrongAnswers` | The 3 wrong options of "what does this word mean?". |
| `hook` | Under "Memory hook" on the new-word card and in the browse list. |
| `synonyms`, `antonyms` | Correct options in the synonym and antonym games. |

Learners are adults studying for tests like the GRE.

## The rubric

Score every criterion from 1 to 5:

- 5: as good as a published learner's dictionary or test-prep book.
- 4: good. Small style nits at most.
- 3: usable, but a careful editor would change it.
- 2: confusing or misleading.
- 1: wrong.

An entry is done when every score is 4 or 5. The verdict is:

- `pass`: you changed nothing, and every score is 4 or more.
- `fixed`: you changed something, and every score is now 4 or more.
- `flagged`: something still scores under 4 and you could not fix it. Say what
  and why in `notes`. Flagged words show in `status` for a person to decide.

### sense

The first sense is the meaning an advanced learner most needs.

- Low: WordNet's first sense is technical or rare. "derivative" came through as
  the calculus noun. The test meaning is the adjective, "imitative of someone
  else's work; not original".
- Fix: rewrite `definition` for the right sense. If that changes the part of
  speech, change `partOfSpeech` too. `apply` then drops the word's other senses,
  because they belong to the old part of speech. Rewrite the examples, wrong
  answers and related words to match.

### definition

An accurate dictionary-style definition of that sense, in one sentence.

- It must not use the word or a form of it. The checks enforce this.
- Low: circular ("Relating to or dealing with the subject of aesthetics") or
  too thin to tell the word apart ("Changeable." for capricious).
- Keep WordNet's text when it scores 4 or more. It is licensed (CC BY 4.0) and
  credited in the app. Never copy from Merriam-Webster, Oxford or other
  commercial dictionaries. Write your own text instead.

### plain

The same meaning in everyday words, for someone meeting the word for the first
time.

- One sentence of about 20 words or fewer.
- No harder word than the one it explains.
- It must not name the word. The "which word means" question shows it as the
  prompt, so naming the word gives the answer away. The checks enforce this.
- Good: "Using very few words to get a point across." (laconic)
- Low: "Capricious describes someone or something that changes very quickly."
  It names the word.

### examples

3 to 5 full sentences that show the meaning.

- Each one is a natural sentence an educated writer would use. The context
  should make the meaning guessable, because the cloze game blanks the word
  out.
- Vary the situations. Avoid five sentences about scientists or politicians.
- Use the word correctly for its part of speech. `cloze` must be the word
  exactly as written in that sentence ("abated", not "abate").
- WordNet's examples are often fragments ("Trenchant criticism"). Rewrite them
  as sentences or drop them.
- Good: "Once the storm abated, the ferries started running again."
- Low: "The scientist gathered empirical data to support her revolutionary
  hypothesis." It is generic, and the word could be swapped for many others.

### wrongAnswers

4 to 6 wrong options for "what does this word mean?". Each should tempt someone
who half knows the word.

- Each one is the real meaning of a real look-alike word. A look-alike shares
  sound, spelling, a prefix or a root with the target. Put that word in
  `lookalike` in its base form.
- The look-alike must have the same part of speech as the target, so grammar
  cannot rule it out. The checks verify this against WordNet.
- Write the meaning in the style and length of `definition`, starting with a
  capital letter and ending with a period.
- No meaning may be close to the target's real meaning, in any of its senses.
- No antonyms of the target, no jokes, no absurd options.
- No wrong answer may appear for two different words. The checks enforce this
  across the whole word list.
- Good, for abate: abet ("Help or encourage someone to do wrong."), abdicate,
  abase, abrade.
- Low, for capricious: "Related to the study of capybaras and similar rodents."
  Nobody would pick it.

### hook

A memory aid in one or two sentences.

- Name a part of the word that sounds like a common English word, or a real
  Latin or Greek root. Say how that part connects to the meaning.
- It must name the word. The checks enforce this.
- Use only true etymology. If you are not sure of a root, use a sound-alike
  instead.
- Spell every word correctly. Do not misspell a word to make it sound alike.
- Good: "Capricious comes from caprice, a sudden change of mind."
- Good: "Aberrant contains err: aberrant behavior errs from the normal path."
- Low: "Think of a heavy storm that begins to abate." It only uses the word.
- Low: "You-be-quitters because ubiquitous things are everywhere you quit
  looking for them." It makes no sense.

### related

Synonyms and antonyms for the first sense.

- At most 6 of each. Each must be a real word (WordNet) that a learner would
  know or want to know.
- Remove words that belong to another sense, and rare or archaic ones
  ("misbegot").
- No antonyms is fine when the word has no clear opposite.
- Nothing offensive. The checks block a list of slurs and vulgar words.

## Rules

- Never change `wordId` or `headword`. Saved progress points at word ids, and
  `apply` refuses a worksheet whose ids and words do not match.
- House style (CLAUDE.md): no em dashes, plain words, no hype. The checks reject
  em dashes.
- Do not change the rubric quietly. If the criteria change, bump
  `RUBRIC_VERSION` in `pipeline/src/lib/curate.ts`. Every word then counts as
  unreviewed again. Say why in PROGRESS.md.
- Every review is kept in the record (`reviews`), with its scores, the fields it
  changed and the notes. The next session reads them through `status`.

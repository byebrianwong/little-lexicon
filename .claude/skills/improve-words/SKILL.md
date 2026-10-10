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

## Start here

A new session picks up where the last one stopped:

1. `cd pipeline && npm ci` if `node_modules` is missing.
2. `npx tsx src/curate.ts status`. It shows how many words are reviewed, which
   are flagged for a person, and the most common problems in the rest.
3. Run the loop below, or "Big runs" for more than about 15 words. `next`
   chooses the words: first any reviewed without a second reviewer, then words
   that give the answer away, then the rest in record order.
4. After `apply`, commit, open or update a pull request, and add a line to the
   "Curation log" at the end of PROGRESS.md (date, words, verdicts, anything new
   you learned).
5. Before you finish, put what this run taught you into the repo, not into
   session memory, so the next session gets it. Add each new reason the second
   reviewer failed an entry to "Traps found so far". Change this skill or
   `pipeline/src/curate.ts` where the run hit a gap. Update "Where to pick up"
   in PROGRESS.md with the new counts.

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
4. Get a second review (see below). `check` and `apply` refuse a word without
   one.
5. `npx tsx src/curate.ts check <worksheet>` runs the checks. It takes several
   worksheets at once, which also checks them against each other. Fix and
   repeat until every word says `ok`. If you change a word's content after the second
   reviewer scored it, clear its `checker.scores` (set them to null) and ask
   again.
6. `npx tsx src/curate.ts apply <worksheet>` writes the record
   (`pipeline/data/content-db.json`) and exports `src/content/words.json`. It
   writes nothing if any word fails.
7. From the repo root, run `npx jest src/lib/content` to check the exported
   file. Commit the record and the words file together, and list the words in
   the commit message.

## The second review

You cannot judge your own writing fairly. Before `check`, give the worksheet to
a subagent (the Agent tool, `general-purpose`) that did not write it. It fills
in each word's `checker.scores` and `checker.notes`. A word passes only when
both your scores and the second reviewer's are 4 or more, or when you flag it.

On the first batch the second reviewer failed 9 of 13 words that the writer had
scored 4 or 5. The main reason: definitions and wrong answers that matched
Oxford's wording, which a writer does not notice in its own text. Use this
prompt, with the paths filled in:

> You are the independent second reviewer for word entries in a vocabulary app
> for adults studying for tests like the GRE. Another session wrote them. Score
> them honestly and strictly. Read the sections "What the app shows" and "The
> rubric" in `.claude/skills/improve-words/SKILL.md`. Then, for each word in
> `<worksheet>`: do not read the `review` block (the writer's own scores);
> score the 7 criteria from 1 to 5 from the content fields alone; check
> accuracy, that each wrong answer really is the meaning of its look-alike and
> not of the target, that etymologies are true, that related words fit the
> first sense, that examples give a clue in the cloze game, and that no text
> copies Oxford, Merriam-Webster or another commercial dictionary (search the
> web for any phrase that sounds like a stock definition). Write only each
> word's `checker.scores` (keys: sense, definition, plain, examples,
> wrongAnswers, hook, related) and `checker.notes` (what is wrong for every
> score under 4, otherwise the weakest point). Do not edit anything else. Then
> run `npx tsx src/curate.ts check <worksheet>` from `pipeline/` and report a
> table of scores and every note under 4.

When it reports back, fix what it found, clear the `checker` block of each word
you changed, and send those words back to the same subagent (SendMessage) to
score again.

Where to draw the line on copying (agreed on the first batch): a definition,
wrong answer or other sense scores 3 when it reproduces a dictionary's whole
definition word for word or with one word changed, and a search confirms the
source. Short common phrasing that several dictionaries share ("unwilling to take
risks") can score 4 with a note. Fix the 3s; do not chase every 4.

Stop after three review rounds on a word. If it still has a score under 4, flag
it with notes saying what is left, and move on.

## Big runs

Worksheets of 10 to 15 words work well. For a run of more than about 15 words
(for example "improve 100 more words"), use one writer subagent and one
reviewer subagent per worksheet. On 2026-10-05, 100 words went through this way
in about half an hour, and 15 failed the first review.

1. `npx tsx src/curate.ts next --count=100 --split=8` writes 8 worksheets
   (`worksheet-<time>-a.json` to `-h.json`) and prints their paths.
2. Start one writer subagent per worksheet (the Agent tool, `general-purpose`,
   in the background), all at once, with the writer prompt below.
3. As each writer finishes, start a new reviewer subagent on that worksheet
   with the prompt in "The second review". Do not reuse the writer.
4. When a reviewer reports, fix its findings yourself in the main session. It
   is usually a few wrong answers or a hook, and a short script edit is faster
   than another writer round. Clear the `checker` block of each word you
   changed, add a line to its `review.notes`, and send the changed words back
   to the same reviewer (SendMessage) to score again.
5. Before applying, check all the worksheets together:
   `npx tsx src/curate.ts check <a.json> <b.json> ...`. Checked one at a time,
   two unapplied worksheets can use the same wrong answer without either
   check noticing.
6. Apply the worksheets one at a time as each passes (`apply` takes one
   file). Only the main session runs `apply`, so two runs never write the
   record at once.

The writer prompt, with the paths filled in:

> You are the writer for one worksheet of word entries in Little Lexicon, a
> vocabulary app for adults studying for tests like the GRE. Your worksheet:
> `<worksheet>`. Read `.claude/skills/improve-words/SKILL.md` in full and
> follow it, including "Traps found so far". For every word: read `problems`,
> score the current content on all 7 criteria, rewrite every field that
> scores under 4, then score the content as it now stands. Fill in
> `review.scores`, `review.verdict` and `review.notes`. Leave the `checker`
> block alone; a separate reviewer fills it in. Do not change `wordId`,
> `headword` or `tier`. Write every definition, wrong answer and other sense
> from scratch in your own words. When one sounds like a stock definition,
> search the web for it in quotes and reword it if it matches a commercial
> dictionary. Then run `npx tsx src/curate.ts check <worksheet>` from
> `pipeline/` and fix every problem except the missing checker scores. Do not
> run `apply`, and do not edit any other file (scratch files go in
> `<scratchpad>/<your batch>/`). When done, reply with a short table: each
> word, its verdict, the fields you changed, and anything you flagged.

## Traps found so far

The second reviewer has failed entries for these reasons. Check for them
before handing a worksheet over.

- **Copied wording, mostly in wrong answers.** Models write stock definitions
  without noticing. Reviewers confirmed copies of Oxford, Oxford Learner's,
  Longman, Cambridge, Collins COBUILD, Merriam-Webster Learner's and
  Vocabulary.com, usually whole definitions with one or two words changed.
  The look-alikes' definitions (massive, salacious, contingent, enunciate,
  append, disbar, deface) were copied more often than the target words'.
- **WordNet senses that are the classic misreading.** WordNet gives enervate
  the sense "disturb the composure of", which is the very mistake tests use
  the word to catch. Drop senses like this.
- **A rare or technical first sense.** WordNet led with articulate "provide
  with a joint", aggrandize "add details to", convoluted "rolled
  lengthwise" and buttress the noun. Move the meaning a learner needs to the
  front and keep the old one as an other sense when it is still useful.
- **False roots and sound-alikes in hooks.** Sagacious does not come from
  sage (it is Latin sagax, "keen-scented"). Cajole does not sound like
  jolly. English salute never meant "wish good health" (the Latin greeting
  did). Check every root; for a sound-alike, check that it really sounds
  alike.
- **Related words from another sense.** debacle had "rout" (a military
  defeat), and deference had "esteem" and "regard" (admiration, not
  yielding). An antonym built on the word (ambiguous and "unambiguous")
  gives the answer away in the antonym game.
- **Examples with no clue.** "Such boorish behavior has no place in a
  professional workplace." fits rude, loud or lazy just as well. Show the
  behavior, so the blank can only be the word.
- **Other senses that repeat the first.** credulous had "showing a lack of
  judgment or experience" next to "disposed to believe on little evidence".
- **Junk text from older generation passes.** disseminate's hook ended in
  markup and invisible characters. The checks now reject code symbols,
  brackets, braces and invisible characters.

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

The first sense is the meaning an advanced learner most needs, and the other
senses are clean.

- Low: WordNet's first sense is technical or rare. "derivative" came through as
  the calculus noun. The test meaning is the adjective, "imitative of someone
  else's work; not original".
- Fix: rewrite `definition` for the right sense. If that changes the part of
  speech, change `partOfSpeech` too. `apply` then drops the word's other senses,
  because they belong to the old part of speech. Rewrite the examples, wrong
  answers and related words to match.
- `otherSenses` lists the word's other definitions. They are not shown on most
  screens, but their text becomes a fallback wrong answer for other words. Keep
  at most 3. Each must be a different meaning from the first sense and from each
  other, with the same part of speech, and must not name the word ("Aesthetically
  pleasing." does). WordNet often lists near copies ("A natural inclination." next
  to "An inclination to do something."); drop them. If you rewrite the first
  sense to a different meaning, keep the old meaning as an other sense when it is
  still useful (catalyst kept its chemistry meaning).

### definition

An accurate dictionary-style definition of that sense, in one sentence.

- It must not use the word or a form of it. The checks enforce this.
- Low: circular ("Relating to or dealing with the subject of aesthetics") or
  too thin to tell the word apart ("Changeable." for capricious).
- Keep WordNet's text when it scores 4 or more. It is licensed (CC BY 4.0) and
  credited in the app.
- Never copy from Merriam-Webster, Oxford or other commercial dictionaries.
  Models reproduce their stock definitions without noticing ("Concerned with
  beauty or the appreciation of beauty" is Oxford's, word for word), so write
  each definition from scratch in your own phrasing, and expect the second
  reviewer to search for matches. This applies to wrong answers and other
  senses too. Text from the Gemini pass may already contain copied phrases.

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

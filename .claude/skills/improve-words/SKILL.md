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

## Learners' reports

Learners can report a problem with a word from the new-word card, the answer
reveal and the word list ("Report a problem"). Each report has a reason
(definition, example, pronunciation, answers, hook, other), an optional note
and the screen it came from. Reports are stored in Supabase
(`little_lexicon.word_reports`, migration 0012). Demo mode keeps them on the
device, so the live demo site sends none.

Handle open reports before other words. From `pipeline/`:

1. `npx tsx src/curate.ts reports` fetches the open reports, saves them to
   `out/curate/reports.json` and lists them by word. It needs
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `pipeline/.env`.
2. `npx tsx src/curate.ts next --reported` writes a worksheet of the reported
   words, reviewed or not, oldest report first. Each entry has a read-only
   `reports` list and the word's `ipa`. Run the loop as usual. Read every
   report, but judge it: a learner can be wrong. Say in `review.notes` what
   each report led to, or why it changed nothing. A reported pronunciation is
   fixed with `curate.ts ipa`, not in the worksheet.
3. After `apply`, run `npx tsx src/curate.ts resolve <worksheet>`. It marks
   resolved the reports on words that were applied since the worksheet was
   made, with the review's notes. Reports filed after the worksheet was made
   stay open, because they may be about the new text. The learner is not
   told.

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
   `npx tsx src/curate.ts pos <word...>` shows a look-alike's parts of speech
   in WordNet before you use it.
5. `npx tsx src/curate.ts check <worksheet>` runs the checks. It takes several
   worksheets at once, which also checks them against each other. Fix and
   repeat until every word says `ok`. If you change a word's content after the second
   reviewer scored it, clear its `checker.scores` (set them to null) and ask
   again.
6. `npx tsx src/curate.ts apply <worksheet>` writes the record
   (`pipeline/data/content-db.json`), remakes the clips for the changed
   sentences in `public/audio`, and exports `src/content/words.json` with
   each clip's URL. It writes nothing if any word fails. The
   clips need the Kokoro env (`pipeline/README.md` > Audio); a dozen words
   take about a minute. Without the env, `apply` warns and skips them.
7. From the repo root, run `npx jest src/lib/content src/content` to check
   the exported file and that every word and sentence has a clip. If the clip
   test fails, run `npx tsx src/run.ts --only=audio`, then `--only=export`,
   from `pipeline/`. CI runs the same test.
8. Commit the record, the words file and `public/audio` together, and list
   the words in the commit message.

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
it with notes saying what is left, and move on. One exception: when all that
is left is one wrong answer, a fourth round that swaps in a different
look-alike is fine (obtuse on 2026-10-10, puerile on 2026-10-11). If that
fails too, leave the word out of `apply` (move it to its own worksheet) so
it stays unreviewed and comes up again next run; preclude went this way on
2026-10-11.
(On 2026-10-10 obtuse got a fourth round because the round 3 failure was a
one-word slip. If you do this, say so in the word's notes.)

## Big runs

Worksheets of 10 to 15 words work well. For a run of more than about 15 words
(for example "improve 100 more words"), use one writer subagent and one
reviewer subagent per worksheet. On 2026-10-05, 100 words went through this way
in about half an hour, and 15 failed the first review. On 2026-10-10, 100
words took about 20 minutes from writing the worksheets to the last apply; 51
failed the first review, 9 the second, and 1 the third.

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
   When a first review fails many words (often 5 to 8 of 12 on new words),
   sending the notes back to that worksheet's own writer (SendMessage) also
   works. It still has the dictionary pages it downloaded. On 2026-10-12
   the writers fixed round 2 this way, and the main session took over from
   round 3.
   If the session hits a usage limit, the running subagents stop mid-task.
   Before resuming them, check that each worksheet is in the state you
   think it is. Most reviewers save a copy before they write, so compare
   the content fields against it. Then resume each agent with SendMessage
   and tell it what state its worksheet is in.
5. Before applying, check all the worksheets together:
   `npx tsx src/curate.ts check <a.json> <b.json> ...`. Checked one at a time,
   two unapplied worksheets can use the same wrong answer without either
   check noticing.
6. Apply the worksheets one at a time as each passes (`apply` takes one
   file). Only the main session runs `apply`, so two runs never write the
   record at once.

On 2026-10-17, 100 new words took up to five review rounds; 81 failed the
first review, mostly because no writer had compared against WordUp's
script text (see "Traps found so far").

Web searches are limited to about 200 per turn, shared by every subagent
started in that turn. On 2026-10-11, four writers told to search every text
used them all up, and the reviewers had none left. Do not ask writers to
search everything. Comparing against downloaded dictionary pages works
without searches and catches more: Oxford Learner's, Cambridge, Longman,
Dictionary.com, Vocabulary.com, American Heritage and WordUp
(`https://dictionary.wordup.com.tw/zh-TW/dictionary/<word>`) download with
curl. Merriam-Webster, Collins and Britannica block curl and WebFetch; the
built-in browser can read them. `python3 -I tools/dictionary-defs.py
<word...>` (from `pipeline/`) prints the seven downloadable dictionaries'
definitions for each word, WordUp's script text included. With
`--examples` it prints Oxford's, Cambridge's, Longman's and WordUp's
example sentences instead, for checking example scenes. Pass each word as
its own argument. Tell writers and reviewers about both, and run them
yourself before writing any main-session fix.

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

## Adding new words

For a request like "add 100 more words". First done on 2026-10-12 (abjure
to venal, word ids 318 to 417), then again the same day (acolyte to wry,
ids 418 to 517; 470 to 481 were held back unused), then on 2026-10-17
(adjudicate to wrest, ids 518 to 617).

1. Pick the words and check each one before it goes in, because a word's id
   is permanent once it is in the record. It must not already be in the
   record (`pipeline/data/content-db.json`, which also holds the retired
   words), and it must be in WordNet (look it up in
   `pipeline/.cache/oewn/entries-<first letter>.json`). A word WordNet
   lacks still gets an id but is never exported.

   Choose by how often the word is used today, not from a GRE list. The
   app wants words that many people do not fully know but still meet in
   real reading. `python3 pipeline/tools/word-frequency.py` gives each
   word's modern frequency (all inflections) and its Google Books trend
   since 1900. The second run used these cutoffs:
   - 0.3 to 4 uses per million words. The taught list's middle word is at
     0.5 and nine in ten are under about 2. Under 0.15 and fading is the
     retirement rule (see "26 rare and fading words retired" in
     PROGRESS.md).
   - A trend of about 0.6 or more, unless the word is plainly current
     (demagogue 0.56 and parochial 0.47 were kept: they were heavily used
     around 1900).
   - Then judgment: drop words most adults know precisely (jubilant,
     timid) and near-copies of a taught word (contrition next to contrite,
     presage next to portend).
   - Treat the frequency of a name or brand with care (cavalier, craven,
     aegis).
   - Avoid words whose meaning is disputed today (bemused, enormity): the
     app shows one first sense, so either choice misleads.

   Start from two or three times as many candidates as you need. On the
   second run, about 1,000 candidates gave 650 in the band. Have a subagent
   check the shortlist against these rules before the words go in; it
   swapped 5 of 100.
2. Add the words to the seed file as a dated section above the "messy
   entries" section.
3. From `pipeline/`, run `npx tsx src/run.ts --only=words`, then
   `--only=senses`. Both are free (Datamuse and WordNet). Do not run the
   `generate` stage; with no API key it skips itself.
4. `words` re-tiers the whole list into five equal groups, so some existing
   words move one tier (55 of 291 on 2026-10-12). That is expected. The
   level picker's sample words are checked by
   `src/features/onboarding/levels.test.ts`; run it after export.
5. The new words come out with only WordNet's definition, other senses,
   examples and synonyms. `next` puts unreviewed words first, so run "Big
   runs" as usual. Tell the writers the words are new, so they write plain,
   examples, wrong answers and hook from scratch, and check WordNet's first
   sense (acerbic, acumen, anodyne, demur, mordant, exhort, foible, lambaste,
   ossify, peripatetic and rapacious all led with the wrong one).
6. Have each writer also write its words' pronunciations to a
   `headword<TAB>/ipa/` file in the scratchpad, and each reviewer check them.
   Then run `curate.ts ipa` on all of them at once (see "Pronunciation").

A new word that still fails after the last review round cannot be left out
of `apply` the way an existing word can: it would ship with only WordNet's
text. Flag it and apply it instead, with notes saying what is left
(assiduous on 2026-10-12, one weak wrong answer).

The words file only gets the new words' full content as each worksheet is
applied. Do not commit until every worksheet is applied, or the app ships
words with no plain definition or wrong answers.

## Traps found so far

The second reviewer has failed entries for these reasons. Check for them
before handing a worksheet over.

- **Copied wording, mostly in wrong answers.** Models write stock definitions
  without noticing. Reviewers confirmed copies of Oxford, Oxford Learner's,
  Longman, Cambridge, Collins COBUILD, Merriam-Webster Learner's and
  Vocabulary.com, usually whole definitions with one or two words changed.
  The look-alikes' definitions (massive, salacious, contingent, enunciate,
  append, disbar, deface) were copied more often than the target words'.
  On 2026-10-10, 51 of 100 words failed the first review, and about 35 of
  those failures involved copied wording, again mostly in wrong answers. New sources that run: WordUp (dictionary.wordup.com.tw, a
  learner's dictionary the reviewers matched often), Dictionary.com and its
  Random House text, Webster's New World, American Heritage and Britannica.
  A writer's search for its own text catches about half of these, so expect
  the reviewer to find the rest. On 2026-10-11, 32 of 60 words failed the
  first review, mostly on copied wording, again mostly in wrong answers.
  WordUp was matched most. New sources that run: Britannica Learner's,
  Wordsmyth, Wordiyo and the Word Smart test-prep book. My own fixes in the
  main session were caught copying too (include, pedantic), so a fix needs
  the same care as a first draft.
- **Copying the reviewer's suggested fix.** A reviewer's note often ends with
  "for example ...". If you paste that sentence in, the same reviewer then
  scores its own writing, and its suggestion can itself follow a dictionary
  (the morose suggestion opened with Merriam-Webster's "sullen and gloomy").
  Write the fix in your own words. If you did use a suggestion, give that
  text to a fresh subagent to check.
- **A wrong answer near the word's own other sense.** compute sits next to
  impute's accounting sense ("assign a value by estimating"), and augment
  next to foment's "build up". Read the other senses before choosing
  look-alikes.
- **An other sense that is a confusable word's meaning.** exacerbate kept
  "make a person more annoyed", which is exasperate. Like enervate above,
  it teaches the mix-up.
- **Look-alikes that share only an ending.** comical, criminal and cynical
  for inimical; circular, singular and muscular for insular; verbose and
  porous for morose. They tempt nobody. Prefer words that share the start or
  the root (insolent, insubordinate and insufferable for insular).
- **Wrong answers of the wrong kind.** For a person noun (iconoclast), a bone
  cell or a computer icon is ruled out at once. For an abstract noun
  (harangue), a dessert or a greenhouse is too.
- **A wrong answer that names its look-alike.** "So plentiful that it
  overflows, as with profuse apologies" tells the learner it defines
  profuse. The checks now reject this.
- **Options in a different form from the definition.** debunk's wrong
  answers began "To debark ...", "To debase ..." while its definition began
  "Prove that ...". The quiz shows 3 of them beside the definition, so the
  one option without "To" was the answer. The checks now require every
  wrong answer to start the way the definition does.
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
- **Examples that use another sense.** inundate had two flood examples
  under an "overwhelm" definition, inimical a "hostile" example under
  "harmful", and obstinate a stain example under "stubborn". Every example
  must show the first sense.
- **Other senses that repeat the first.** credulous had "showing a lack of
  judgment or experience" next to "disposed to believe on little evidence".
- **Wrong answers of the wrong kind.** A look-alike can share the part of
  speech and still be ruled out at a glance. reprobate (a person) had
  probate (a court process) and prattle (talk) had paddle (a boat oar).
  Match the kind of thing too: a person for a person, a kind of talk for a
  kind of talk.
- **Look-alikes that share only an ending or a letter or two.** acrobat
  (reprobate), exotic and chaotic (quixotic), squalid and stellar (stolid)
  tempt nobody. stolid was missing solid, the look-alike learners actually
  confuse it with. Prefer a shared root, prefix or sound.
- **An example where a wrong answer fits the blank.** remonstrate's
  "gathered outside headquarters to remonstrate against the wage cuts"
  reads better with demonstrate, which was one of its wrong answers. Check
  each example against the word's own wrong answers.
- **WordNet first senses that belong to another word.** pugnacious came
  through as "tough and callous by virtue of experience" (hard-bitten's
  meaning), and every example followed it. savant led with "initiate".
  Read the first sense against what the word means before keeping it.
- **A rewrite that keeps the old frame.** On 2026-10-11 puerile's
  puritanical option and preclude's include option failed three rounds in
  a row: each rewrite kept the dictionary's structure with new words. After
  two failed rewrites of one wrong answer, swap in a different look-alike
  instead of rewording again, and describe it from an angle dictionaries do
  not use. preclude's replacement, prescribe, still followed Longman
  ("say what medicine or treatment a sick person should have") because it
  described the same act the same way.
- **Wrong answers that stand out by style.** On 2026-10-11 the writers were
  told to describe look-alikes "through a concrete case" to keep away from
  dictionary wording. The wrong answers came back with "like ..." pictures
  ("Savage and eager to cause pain, like a dog that bites without warning")
  while the correct option was a bare WordNet definition, so the right answer
  could be picked by style alone. Keep wrong answers plain and the same
  length and style as `definition`.
- **Junk text from older generation passes.** disseminate's hook ended in
  markup and invisible characters. The checks now reject code symbols,
  brackets, braces and invisible characters.
- **A word's own meaning used as its wrong answer.** unctuous had "covered
  in oil" (its own oily sense), umbrage had tree shade, and vex had "puzzle
  someone". Read every wrong answer against all of the word's senses, not
  only the first.
- **Other senses that are another word's meaning.** vacillate kept
  "Move or sway in a rising and falling or wavelike pattern", which is the
  meaning of undulate. Other senses become fallback wrong answers, so this
  one could have been shown as a wrong answer for undulate when it is right.
- **WordNet text is not always safe for wrong answers.** On 2026-10-12 a
  writer switched many wrong answers to WordNet's glosses to avoid copying.
  The reviewer found that several WordNet glosses themselves track Random
  House or American Heritage (conjure, accretion, cavalcade, anomaly,
  anomalous, insidious, arduous). The terse glosses also made the correct
  option, written in full prose, stand out by length (arcane). Check WordNet
  text like any other, and keep every option for a word in one style.
- **The main session's quick fixes copy too.** On 2026-10-12 three of my
  replacement wrong answers followed a dictionary (viscous followed WordUp,
  culpability WordUp, detonate Oxford). What worked: download the new
  look-alike's pages with a reviewer's fetch script and read them before
  writing the option, then write from an angle they do not use (vitrified
  as fired clay, not "turned into glass").
- **A look-alike only one letter away from the target's own other sense.**
  fecund's rubicund ("red-faced") sat beside florid's red-face other sense.
  The reviewer judged it safe: fallback wrong answers come from other words'
  senses, not from their wrong answers, so neither could be marked wrong
  when right. Worth a look, not a rule.
- **Hooks that rest on spelling the ear never hears.** surmise "starts with
  the letters of sure" (it does not), and cabal "starts with cab" (said
  kuh-BAHL). Both failed on 2026-10-12. Check a sound-alike by saying the
  word aloud.
- **Popular etymology myths.** cabal's first hook told the story that
  Charles II's ministers' initials made the word. The word is older, from
  French cabale. Check origin stories that sound too neat.
- **A look-alike that is one of the target's own older or informal
  meanings.** untoward once meant unruly, so wayward was defensible;
  cavalier as a noun is a gallant gentleman, so chivalrous was; welter is
  informal for a welterweight boxer. Read the full entry in two or three
  dictionaries, not only WordNet, before choosing look-alikes.
- **Replacement look-alikes picked in a hurry.** When writers swapped a
  failed look-alike, several new ones shared only a letter or two (weld,
  welcome, harpoon) or were the wrong kind of thing. Choose the
  replacement by the same rules as the first set.

- **WordUp's text is inside `<script>` tags.** WordUp puts its
  definitions, usage notes and example sentences in script data. On
  2026-10-17 every writer's text extraction stripped scripts, so none of
  them compared against WordUp, and 81 of 100 new words failed the first
  review, many on WordUp matches. Keep the script contents when you
  extract a WordUp page (`tools/dictionary-defs.py` does).
- **Example scenes retold from a dictionary.** Reviewers failed examples
  that kept a dictionary's example scene with new words: a landlord
  raising rent (foist), a retired judge settling a builders' dispute
  (adjudicate), a car skidding across lanes (careen), a company polishing
  its image (burnish). Read the dictionaries' examples, WordUp's
  included, and pick a different situation.
- **Reusing another word's option for the same look-alike.** Writers
  borrowed the record's wording: vicarious on visceral was vitriolic's
  option with one comma removed, and cogitate, intermittent, lucid,
  moratorium, missionary, panorama, benighted and nepotism nearly
  repeated older options. A learner then sees the same wrong answer
  under two words. `check` now ignores case and punctuation and rejects
  an option that shares half its content words with another word's
  option for the same look-alike. The 38 older pairs were fixed on
  2026-10-19, and `status` now lists any pair that remains. Two options
  for one look-alike will always mean the same thing; that is allowed.
  Only near-identical wording fails, so tell reviewers this.
- **Dropping beats a third rewording.** On 2026-10-17 the main session's
  own rewrites failed six times (metamorphose, cogitate, modify,
  nepotism, skepticism, a landlord example), each by keeping a
  dictionary's frame. When a word still has 4 other options, drop the
  failed one. When it has only 4, swap in a look-alike whose
  dictionaries you have read first.

- **Touching an older word means reviewing all of it again.** On
  2026-10-19, 33 older words went on worksheets only to fix near-repeat
  options. The second reviewer failed 29 of them in the first round, almost
  all on older options that follow WordUp, Cambridge or Oxford. Those
  options were reviewed before WordUp's script text was readable (see
  above), so earlier reviewers could not catch them. Plan for two or three
  rounds on any older word you put on a worksheet, even for a one-option
  change.
- **A dropped option can leave weak look-alikes.** Dropping the repeated
  option left cogent, efficacy, esoteric, fallacious and inimical with two
  look-alikes that share only an ending (pungent and indigent on cogent).
  Before dropping, check that the 4 options left still tempt. If they do
  not, bring the dropped look-alike back with new wording instead.
- **`tools/dictionary-defs.py` showed no real Dictionary.com text before
  2026-10-19.** Its pattern matched a site-wide line ("deserving respect or
  admiration") on every page. Text checked against it before then was not
  compared with Dictionary.com or the Collins text it carries.

- **A main-session fix that swaps a list item by item.** On 2026-10-23
  engender's round 3 definition, "Act as the seed of a feeling, attitude
  or condition", kept WordUp's "a feeling, attitude, or situation" with
  one word changed. A list of three kinds of thing is a frame too. Drop
  the list or cut it to a different pair.
- **What counts as a shared frame.** Reviewers differ on this. On
  2026-10-23 one reviewer failed "to become less strong, or make
  something do that" because Longman uses it, though every dictionary
  frames abate that way. Tell reviewers the line: text that three or more
  dictionaries share as the plain meaning scores 4 with a note; only one
  dictionary's own frame, list or detail scores 3.
- **A look-alike that reads as the antonym.** sympathy on apathy and
  confident on diffident (as an antonym) can be ruled out because they
  are the opposite feeling. Choose look-alikes whose meaning is unrelated,
  not opposite.
- **A look-alike that shares the target's whole subject.** assiduous on
  arduous (both about long, hard effort) and euphony next to a hook that
  glosses euphemism as "good-sounding words" sit too close. Check the hook
  and every example against each new look-alike.
- **Older examples can be wrong in fact.** desiccate had "Museum staff
  desiccate insect specimens before pinning them" (dried insects shatter,
  so they are pinned fresh or relaxed first), and conundrum's corundum was
  "ground into emery" (emery is a rock that contains corundum).
- **A hook that points at a wrong answer.** rancorous's hook named
  rancid, remonstrate's named demonstrate, and proclivity's hook explained
  the word through a downhill slope, which is what declivity (one of its
  wrong answers) means. A learner who remembers the hook then picks the
  wrong option. Read each hook against the word's look-alikes.
- **Reading only part of the dictionary output.** On 2026-10-23 two
  main-session fixes copied text that sat past the end of a line the
  main session had cut short (`head`, and the tool's own 220-character
  limit, now 400). Read the whole output for a look-alike before writing
  its option.
- **Stale `problems` lists.** A worksheet's `problems` is written when the
  worksheet is made and is not updated. Reviewers kept reporting old
  "like ..." problems that a writer had already fixed. `check` is the
  current list.

## Pronunciation

Pronunciation (`ipa`) is not part of the rubric or the worksheet. It shows
under the headword on the new-word card, the browse list and the reveals.
Every word uses one style: broad General American, as in an American
learner's dictionary. Use "r" (not "ɹ"), "ɝ" in a stressed syllable and "ɚ"
in an unstressed one, "oʊ", "əl" and "ən" for syllabic l and n, and "ˈ" and
"ˌ" for stress. No syllable dots, length marks, tie bars or British forms.
Match the part of speech: adulterate the verb ends in /-ˌreɪt/, the
adjective in /-rət/.

To change pronunciations, write a file of `headword<TAB>/ipa/` lines and run
`npx tsx src/curate.ts ipa <file>` from `pipeline/`. It checks each one
against the style, sets it and the syllable count, remakes the clips of the
changed words (they pin each word's IPA), and exports. `status`
lists any word whose pronunciation is missing or off style. All 317 were
rewritten on 2026-10-11 and checked by a second reviewer. Have a second
reviewer check new ones too.

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

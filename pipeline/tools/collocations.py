"""Print the words each word is most often used with, so pairings rest on real usage.

For each word it prints, from Datamuse (https://www.datamuse.com/api/):

- the words found most often right before it and right after it (Datamuse's
  `rc` and `lc` context), for each form of a verb or noun ("abate", "abated",
  "abating"), with Datamuse's score (higher is more common; compare scores
  within one list only);
- for an adjective, the nouns it most often describes (`rel_jja`), and for a
  noun, the adjectives most often used with it (`rel_jjb`), most common first.

Common function words (the, of, to, had ...) are left out. The part of speech
is the word's first sense in `data/content-db.json`, or Datamuse's when the
word is not in the record; `--pos=verb` sets it.

`--check "phrase" ...` prints each phrase's frequency in Google Books from 2010
to 2022 (the Ngram Viewer's JSON endpoint, case-insensitive), in uses per
billion phrases of the same length. A phrase with `*` lists the most common
words in that slot ("abate the *", "* abated"). If the endpoint cannot be
reached, the tool says so and skips the check.

Usage, from `pipeline/`:

    python3 -I tools/collocations.py abate insular
    python3 -I tools/collocations.py --pos=noun cabal
    python3 -I tools/collocations.py --check "tensions abate" "abate the *"

Responses are cached in `.cache/collocations/` (git-ignored). Pass each word
as its own argument.
"""

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '..', '.cache', 'collocations')
RECORD = os.path.join(HERE, '..', 'data', 'content-db.json')
DATAMUSE = 'https://api.datamuse.com/words'
NGRAM = 'https://books.google.com/ngrams/json'
USER_AGENT = 'LittleLexicon-collocations/1.0 (vocabulary app content checks)'
SHOW = 12

STOPWORDS = set(
    """
    a an the and or but nor so yet if then than as of to in on at by for from with without into onto
    upon over under about above below after before during between among through across against
    within out up down off this that these those it its it's he him his she her hers they them their
    theirs we us our ours you your yours i me my mine who whom whose which what when where why how
    is are was were be been being am has have had having do does did doing done will would shall
    should can could may might must not no nor never also only just very too more most much many
    such some any all each every other another one two both either neither there here
    """.split()
)
DATAMUSE_POS = {'n': 'noun', 'v': 'verb', 'adj': 'adjective', 'adv': 'adverb'}


def get_json(url, user_agent=USER_AGENT):
    """The URL's JSON, from the cache or the network."""
    path = os.path.join(CACHE, hashlib.sha256(url.encode('utf-8')).hexdigest()[:24] + '.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    request = urllib.request.Request(url, headers={'User-Agent': user_agent})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read().decode('utf-8')
    os.makedirs(CACHE, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(body)
    time.sleep(0.2)
    return json.loads(body)


def datamuse(**params):
    return get_json(DATAMUSE + '?' + urllib.parse.urlencode({**params, 'max': 60}))


def record_parts_of_speech():
    """headword -> part of speech of its first sense, from the pipeline's record."""
    try:
        with open(RECORD, encoding='utf-8') as f:
            db = json.load(f)
    except (OSError, ValueError):
        return {}
    return {w['headword']: w.get('part_of_speech') for w in db.get('words', [])}


def part_of_speech(word, known):
    if known.get(word):
        return known[word]
    hits = datamuse(sp=word, md='p')
    if hits and hits[0].get('word') == word:
        for tag in hits[0].get('tags', []):
            if tag in DATAMUSE_POS:
                return DATAMUSE_POS[tag]
    return 'unknown'


def forms(word, pos):
    """The spellings to look up, like inflections() in src/lib/wordnet.ts."""
    out = [word]
    if pos == 'verb':
        stem = word[:-1] if word.endswith('e') else word
        if re.search(r'[^aeiou]y$', word):
            out += [word[:-1] + 'ies', word[:-1] + 'ied', word + 'ing']
        else:
            out += [word + ('es' if re.search(r'(s|x|z|ch|sh)$', word) else 's'), stem + 'ed', stem + 'ing']
    elif pos == 'noun':
        if re.search(r'[^aeiou]y$', word):
            out.append(word[:-1] + 'ies')
        else:
            out.append(word + ('es' if re.search(r'(s|x|z|ch|sh)$', word) else 's'))
    return out


def content_words(hits):
    return [
        (h['word'], h.get('score', 0))
        for h in hits
        if re.fullmatch(r"[a-z][a-z'-]*", h['word']) and h['word'] not in STOPWORDS
    ][:SHOW]


def show_word(word, pos):
    print(f'=== {word} ({pos})')
    for form in forms(word, pos):
        before = content_words(datamuse(sp='*', rc=form))
        after = content_words(datamuse(sp='*', lc=form))
        if before:
            print(f'  before "{form}" (rc): ' + ', '.join(f'{w} {s}' for w, s in before))
        if after:
            print(f'  after "{form}" (lc): ' + ', '.join(f'{w} {s}' for w, s in after))
    if pos == 'adjective':
        nouns = content_words(datamuse(rel_jja=word))
        if nouns:
            print(f'  nouns it describes (rel_jja), most common first: {", ".join(w for w, _ in nouns)}')
    if pos == 'noun':
        adjectives = content_words(datamuse(rel_jjb=word))
        if adjectives:
            print(f'  adjectives used with it (rel_jjb), most common first: {", ".join(w for w, _ in adjectives)}')


def per_billion(series):
    return sum(series) / len(series) * 1e9 if series else 0.0


def check_phrases(phrases):
    print('=== Google Books, 2010 to 2022, uses per billion phrases of the same length')
    for phrase in phrases:
        url = NGRAM + '?' + urllib.parse.urlencode(
            {'content': phrase, 'year_start': 2010, 'year_end': 2022, 'corpus': 'en', 'smoothing': 0, 'case_insensitive': 'true'}
        )
        try:
            # The endpoint refuses some clients without a browser User-Agent.
            data = get_json(url, 'Mozilla/5.0 (compatible; LittleLexicon-collocations/1.0)')
        except (urllib.error.URLError, OSError, ValueError) as err:
            print(f'  The Ngram endpoint could not be reached ({err}); skipping the check.')
            return
        top = [d for d in data if not d.get('parent')]
        if not top:
            print(f'  "{phrase}": not found')
            continue
        for d in top:
            print(f'  "{phrase}": {per_billion(d["timeseries"]):.2f}')
        if '*' in phrase:
            for d in data:
                if d.get('parent') and '*' in d['parent']:
                    print(f'      {d["ngram"]}: {per_billion(d["timeseries"]):.2f}')


def main():
    args = sys.argv[1:]
    if '--check' in args:
        i = args.index('--check')
        phrases, args = args[i + 1:], args[:i]
    else:
        phrases = []
    pos_override = next((a.split('=', 1)[1] for a in args if a.startswith('--pos=')), None)
    words = [a.lower() for a in args if not a.startswith('--')]
    if not words and not phrases:
        print(__doc__)
        sys.exit(1)
    known = record_parts_of_speech()
    try:
        for word in words:
            show_word(word, pos_override or part_of_speech(word, known))
    except (urllib.error.URLError, OSError, ValueError) as err:
        print(f'Datamuse could not be reached: {err}', file=sys.stderr)
        sys.exit(1)
    if phrases:
        check_phrases(phrases)


if __name__ == '__main__':
    main()

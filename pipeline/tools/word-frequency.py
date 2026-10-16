"""Frequency and trend for candidate words, to help pick new words.

Prints one tab-separated line per word:

    word  per_million  trend

- per_million: how often the word appears in modern text, per million words,
  counting its inflections (vex, vexes, vexed, vexing). From the wordfreq
  dataset (news, Wikipedia, web text, subtitles, books, up to about 2021).
- trend: Google Books use in 2010-2022 divided by use in 1900-1929. Under 1
  means the word is used less than it was a century ago.

The inflections follow `inflections()` in `src/lib/wordnet.ts`. Forms that are
not real words have a frequency of 0, so extra forms do no harm. A word that is
also a name or brand (cavalier, craven) gets an inflated number; judge those by
hand.

Setup: `pip3 install --user wordfreq`. The trend needs network access and
calls curl, because Google's endpoint has refused Python's own HTTP client.

Usage, from `pipeline/`:

    python3 tools/word-frequency.py furtive portend ostensible
    python3 tools/word-frequency.py < candidates.txt
    python3 tools/word-frequency.py --no-trend < candidates.txt

See "Adding new words" in `.claude/skills/improve-words/SKILL.md` for the
cutoffs used on 2026-10-12.
"""

import json
import re
import subprocess
import sys
import time
import urllib.parse

from wordfreq import word_frequency


def inflections(word):
    forms = {word, word + 's', word + 'es', word + 'ed', word + 'd', word + 'ing'}
    if word.endswith('e'):
        forms.add(word[:-1] + 'ing')
    if re.search(r'[^aeiou]y$', word):
        forms |= {word[:-1] + 'ies', word[:-1] + 'ied'}
    if re.search(r'[^aeiou][aeiou][b-df-hj-np-tvz]$', word):
        forms |= {word + word[-1] + 'ed', word + word[-1] + 'ing'}
    return forms


def per_million(word):
    return sum(word_frequency(form, 'en') for form in inflections(word)) * 1e6


def trends(words):
    """Google Books 2010-2022 over 1900-1929, ten words per request."""
    result = {}
    for start in range(0, len(words), 10):
        batch = words[start:start + 10]
        query = urllib.parse.urlencode({
            'content': ','.join(batch), 'year_start': 1900, 'year_end': 2022,
            'corpus': 'en', 'smoothing': 0,
        })
        url = 'https://books.google.com/ngrams/json?' + query
        data = None
        for attempt in range(4):
            out = subprocess.run(['curl', '-s', '-A', 'Mozilla/5.0', url],
                                 capture_output=True, text=True).stdout
            try:
                data = json.loads(out)
                break
            except json.JSONDecodeError:
                time.sleep(5 * (attempt + 1))
        if data is None:
            print(f'trend lookup failed for: {", ".join(batch)}', file=sys.stderr)
        for series in data or []:
            values = series['timeseries']
            early = sum(values[0:30]) / 30
            late = sum(values[110:123]) / 13
            result[series['ngram']] = late / early if early else float('inf')
        time.sleep(1.2)
    return result


def main():
    args = sys.argv[1:]
    with_trend = '--no-trend' not in args
    words = [a.lower() for a in args if not a.startswith('--')]
    if not words:
        words = [w.lower() for w in sys.stdin.read().split()]
    trend = trends(words) if with_trend else {}
    for word in words:
        t = trend.get(word)
        t_text = '' if t is None else f'{t:.2f}'
        print(f'{word}\t{per_million(word):.3f}\t{t_text}')


if __name__ == '__main__':
    main()

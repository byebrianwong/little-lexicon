"""Print the definitions seven dictionaries give for each word.

Use it before writing a wrong answer, a definition or an other sense, so the
new text does not follow a dictionary's wording. It reads WordUp's definitions
from inside its <script> tags, which a plain text extraction throws away.

Usage, from `pipeline/`:

    python3 -I tools/dictionary-defs.py ossify quietus

Pages are cached in `.cache/dict/` (git-ignored). Merriam-Webster, Collins
and Britannica block curl, so they are not covered; search for those.
"""

import html
import os
import re
import subprocess
import sys

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.cache', 'dict')

SOURCES = {
    'oxford': 'https://www.oxfordlearnersdictionaries.com/definition/english/{w}',
    'cambridge': 'https://dictionary.cambridge.org/dictionary/english/{w}',
    'longman': 'https://www.ldoceonline.com/dictionary/{w}',
    'dictionary.com': 'https://www.dictionary.com/browse/{w}',
    'vocabulary.com': 'https://www.vocabulary.com/dictionary/{w}',
    'ahd': 'https://ahdictionary.com/word/search.html?q={w}',
    'wordup': 'https://dictionary.wordup.com.tw/zh-TW/dictionary/{w}',
}

PATTERNS = {
    'oxford': [r'<span class="def"[^>]*>(.*?)</span>\s*(?:</span>|<)'],
    'cambridge': [r'<div class="def ddef_d db">(.*?)</div>'],
    'longman': [r'<span class="DEF">(.*?)</span>\s*(?:<span class="(?:EXAMPLE|GramExa|ColloExa)|</span>|<)'],
    # The page's "definition" JSON field is site-wide text ("deserving respect
    # or admiration") that appears on every page, so read the definition list.
    'dictionary.com': [r'class="item-definition">\s*<p class="txt-variant-label-short">(.*?)</p>'],
    'vocabulary.com': [r'<p class="short">(.*?)</p>', r'<p class="long">(.*?)</p>', r'<div class="definition">(.*?)</div>'],
    'ahd': [r'<div class="ds-(?:list|single)">(.*?)</div>'],
    'wordup': [r'\\?"(?:definition|meaning)\\?":\\?"([^"\\]{10,300})'],
}


def fetch(source, word):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'{source}-{word}.html')
    if not os.path.exists(path):
        subprocess.run(['curl', '-sL', '--max-time', '25', '-A', 'Mozilla/5.0',
                        SOURCES[source].format(w=word), '-o', path])
    try:
        with open(path, encoding='utf-8', errors='ignore') as f:
            return f.read()
    except FileNotFoundError:
        return ''


def clean(text):
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    return re.sub(r'\s+', ' ', text).strip()


def main():
    for word in sys.argv[1:]:
        print(f'=== {word}')
        for source in SOURCES:
            page = fetch(source, word)
            found = []
            for pattern in PATTERNS[source]:
                for match in re.findall(pattern, page, flags=re.S):
                    text = clean(match)
                    if len(text) > 6 and text not in found:
                        found.append(text)
            for text in found[:5]:
                print(f'  {source}: {text[:220]}')


if __name__ == '__main__':
    main()

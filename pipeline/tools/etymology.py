"""Print the English etymology Wiktionary gives for each word, as readable text.

Use it to check the facts in a word's origin, roots and memory hook before
writing or scoring them (the "Extras" section of
`.claude/skills/improve-words/SKILL.md`). Wiktionary's text is licensed
CC BY-SA, so this tool is for checking facts only: write every origin in your
own words and never copy Wiktionary's sentences.

Usage, from `pipeline/`:

    python3 -I tools/etymology.py abate supercilious
    python3 -I tools/etymology.py --raw prolific      also print the wikitext
    python3 -I tools/etymology.py --refresh insular   fetch again, ignoring the cache

Each word's page is fetched once through the MediaWiki API
(en.wiktionary.org/w/api.php) with a descriptive User-Agent, one request at a
time with a pause between them. When the API answers 429 (too many requests),
the tool waits as long as it is told and tries again. Raw responses are cached
in `.cache/wiktionary/` (git-ignored). Pass each word as its own argument.

The common etymology templates (der, inh, bor, lbor, af, prefix, suffix, m, l,
cog, etyl, uder, ...) are turned into text such as
`Latin supercilium ("eyebrow")`. Greek words get a transliteration in the form
used for roots (sykophantes, chronos). Templates the tool does not know are
left out and listed, so you can read the page itself when one matters.
"""

import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.cache', 'wiktionary')
API = 'https://en.wiktionary.org/w/api.php'
PAGE = 'https://en.wiktionary.org/wiki/'
USER_AGENT = (
    'LittleLexicon-etymology/1.0 (fact checks for a vocabulary app; '
    'https://github.com/byebrianwong/little-lexicon) Python-urllib'
)
PAUSE = 1.5  # seconds between requests
MAX_WAIT = 120  # longest wait after a 429, in seconds
ATTEMPTS = 5

LANGS = {
    'en': 'English', 'enm': 'Middle English', 'ang': 'Old English', 'sco': 'Scots',
    'la': 'Latin', 'la-lat': 'Late Latin', 'LL.': 'Late Latin', 'la-med': 'Medieval Latin',
    'ML.': 'Medieval Latin', 'la-new': 'New Latin', 'NL.': 'New Latin', 'la-vul': 'Vulgar Latin',
    'VL.': 'Vulgar Latin', 'la-ecc': 'Ecclesiastical Latin', 'la-cla': 'Classical Latin',
    'la-ren': 'Renaissance Latin', 'itc-pro': 'Proto-Italic',
    'grc': 'Ancient Greek', 'grc-koi': 'Koine Greek', 'grc-att': 'Attic Greek', 'grc-ion': 'Ionic Greek',
    'grc-dor': 'Doric Greek', 'gkm': 'Byzantine Greek', 'el': 'Greek', 'grk-pro': 'Proto-Hellenic',
    'fr': 'French', 'fro': 'Old French', 'frm': 'Middle French', 'xno': 'Anglo-Norman',
    'roa-onf': 'Old Northern French', 'pro': 'Old Occitan', 'oc': 'Occitan', 'it': 'Italian',
    'es': 'Spanish', 'osp': 'Old Spanish', 'pt': 'Portuguese', 'ca': 'Catalan', 'ro': 'Romanian',
    'de': 'German', 'gmh': 'Middle High German', 'goh': 'Old High German', 'nl': 'Dutch',
    'dum': 'Middle Dutch', 'odt': 'Old Dutch', 'gml': 'Middle Low German', 'nds': 'Low German',
    'osx': 'Old Saxon', 'ofs': 'Old Frisian', 'frk': 'Frankish', 'non': 'Old Norse', 'is': 'Icelandic',
    'da': 'Danish', 'sv': 'Swedish', 'no': 'Norwegian', 'nb': 'Norwegian Bokmål', 'got': 'Gothic',
    'gem-pro': 'Proto-Germanic', 'gmw-pro': 'Proto-West Germanic', 'ine-pro': 'Proto-Indo-European',
    'cel-pro': 'Proto-Celtic', 'ga': 'Irish', 'sga': 'Old Irish', 'gd': 'Scottish Gaelic', 'cy': 'Welsh',
    'br': 'Breton', 'sa': 'Sanskrit', 'hi': 'Hindi', 'ur': 'Urdu', 'fa': 'Persian', 'pal': 'Middle Persian',
    'ar': 'Arabic', 'he': 'Hebrew', 'hbo': 'Biblical Hebrew', 'arc': 'Aramaic', 'syc': 'Classical Syriac',
    'akk': 'Akkadian', 'egy': 'Egyptian', 'cop': 'Coptic', 'phn': 'Phoenician', 'tr': 'Turkish',
    'ota': 'Ottoman Turkish', 'ru': 'Russian', 'pl': 'Polish', 'cs': 'Czech', 'yi': 'Yiddish',
    'ja': 'Japanese', 'zh': 'Chinese', 'cmn': 'Mandarin', 'ko': 'Korean', 'ms': 'Malay',
    'nah': 'Nahuatl', 'qu': 'Quechua', 'mul': 'Translingual', 'sem-pro': 'Proto-Semitic',
    'iir-pro': 'Proto-Indo-Iranian', 'sla-pro': 'Proto-Slavic', 'urj-pro': 'Proto-Uralic',
}

POS_HEADINGS = {
    'Noun', 'Verb', 'Adjective', 'Adverb', 'Preposition', 'Conjunction', 'Interjection', 'Pronoun',
    'Proper noun', 'Prefix', 'Suffix', 'Phrase', 'Prepositional phrase', 'Determiner', 'Numeral',
    'Particle', 'Participle', 'Contraction', 'Idiom',
}

# Derivation templates: [target language, source language, term, alt, gloss].
# The value is the text shown before the language, if any.
DERIVATION = {
    'der': '', 'derived': '', 'inh': '', 'inherited': '', 'bor': '', 'borrowed': '', 'uder': '',
    'der?': 'possibly', 'inh?': 'possibly', 'bor?': 'possibly',
    'der+': 'Derived from', 'inh+': 'Inherited from', 'bor+': 'Borrowed from',
    'lbor': 'Learned borrowing from', 'learned borrowing': 'Learned borrowing from',
    'slbor': 'Semi-learned borrowing from', 'semi-learned borrowing': 'Semi-learned borrowing from',
    'obor': 'Orthographic borrowing from', 'ubor': 'Unadapted borrowing from',
    'cal': 'Calque of', 'calque': 'Calque of', 'clq': 'Calque of',
    'pcal': 'Partial calque of', 'partial calque': 'Partial calque of',
    'sl': 'Semantic loan from', 'semantic loan': 'Semantic loan from',
    'psm': 'Phono-semantic matching of', 'translit': 'Transliteration of',
}
# Mention templates: [language, term, alt, gloss].
MENTION = {'m', 'mention', 'l', 'link', 'll', 'l-self', 'm-self', 'm+', 'langname-mention'}
# Cognates: [language, term, alt, gloss], shown with the language name.
COGNATE = {'cog', 'cognate', 'ncog', 'noncog', 'noncognate', 'cog+'}
# Affix templates: [language, part, part, ...].
AFFIX = {
    'af': '', 'affix': '', 'compound': '', 'com': '', 'com+': 'Compound of', 'blend': 'Blend of',
    'surf': 'By surface analysis,', 'surface analysis': 'By surface analysis,',
    'univerbation': 'Univerbation of', 'univ': 'Univerbation of',
}
# One-term templates: [language, term, alt, gloss], shown after a phrase.
OF_TEMPLATES = {
    'bf': 'Back-formation from', 'back-form': 'Back-formation from', 'back-formation': 'Back-formation from',
    'clipping': 'Clipping of', 'clip': 'Clipping of', 'abbrev': 'Abbreviation of',
    'short for': 'Short for', 'ellipsis': 'Ellipsis of', 'deverbal': 'Deverbal from',
}
FIXED = {
    'unk': 'Unknown', 'unknown': 'Unknown', 'unc': 'Uncertain', 'uncertain': 'Uncertain',
    'onom': 'Onomatopoeic', 'onomatopoeic': 'Onomatopoeic', 'rfe': '(no etymology written yet)',
}
QUALIFIER = {'q', 'qual', 'qualifier', 'i', 'qf', 'gloss', 'gl', 'sense', 's', 'lb'}
FIRST_ARG = {'nowrap', 'smallcaps', 'small', 'sup', 'sub', 'IPAchar', 'IPAfont', 'nobr', 'taxlink', 'vern', 'upright'}
INVISIBLE = {
    'root', 'dercat', 'etymon', 'etymid', 'senseid', 'PIE word', 'cln', 'c', 'C', 'topics', 'top',
    'catlangname', 'attn', 'rfc', 'rfv-etym', 'rfd', 'rfquote', 'wikipedia', 'was wotd', 'commonscat',
    'multiple images', 'picdic', 'swp', 'refn', 'defdate', 'tea room', 'tea room sense', 'rel-top',
    'rel-bottom', 'col', 'col2', 'col3', 'ws', 'IPA', 'audio', 'nonlemma', 'anchor', 'ety-sp',
    'sense-id', 'lena', 'm-g', 'redlink category', 'wp', 'pedia', 'projectlink',
    'col-top', 'col-bottom', 'der-top', 'der-bottom', 'checksense', 'rfdef',
}
UNCERTAIN = re.compile(
    r'\b(uncertain|unknown|unclear|obscure|disputed|doubtful|possibly|perhaps|probably|apparently|'
    r'folk etymology|popular etymology)\b',
    re.I,
)


# --- fetching --------------------------------------------------------------------


def cache_path(word):
    return os.path.join(CACHE, re.sub(r'[^A-Za-z0-9_-]', '_', word) + '.json')


def fetch(word, refresh=False):
    """The API's parse response for the word's page, from the cache or the network."""
    path = cache_path(word)
    if not refresh and os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    params = {
        'action': 'parse', 'page': word, 'prop': 'wikitext', 'format': 'json',
        'formatversion': '2', 'redirects': '1', 'maxlag': '5',
    }
    url = API + '?' + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    for attempt in range(1, ATTEMPTS + 1):
        wait = None
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read().decode('utf-8')
            data = json.loads(body)
            if data.get('error', {}).get('code') == 'maxlag':
                wait = 10
            else:
                os.makedirs(CACHE, exist_ok=True)
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(body)
                time.sleep(PAUSE)
                return data
        except urllib.error.HTTPError as err:
            if err.code not in (429, 503) or attempt == ATTEMPTS:
                raise
            retry_after = err.headers.get('Retry-After', '')
            wait = int(retry_after) if retry_after.isdigit() else 30 * attempt
        wait = min(wait, MAX_WAIT)
        print(f'  (Wiktionary asked to slow down; waiting {wait} s, attempt {attempt} of {ATTEMPTS})', file=sys.stderr)
        time.sleep(wait)
    raise RuntimeError(f'Wiktionary did not answer for "{word}"')


# --- the page --------------------------------------------------------------------

HEADING = re.compile(r'^(=+)\s*(.+?)\s*\1\s*$', re.M)


def english_section(wikitext):
    start = re.search(r'^==\s*English\s*==\s*$', wikitext, re.M)
    if not start:
        return None
    rest = wikitext[start.end():]
    end = re.search(r'^==[^=].*?==\s*$', rest, re.M)
    return rest[: end.start()] if end else rest


def etymology_sections(section):
    """[(heading, wikitext, parts of speech under it)] for each Etymology heading."""
    heads = list(HEADING.finditer(section))
    out = []
    for i, head in enumerate(heads):
        title = head.group(2)
        if not title.startswith('Etymology'):
            continue
        end = heads[i + 1].start() if i + 1 < len(heads) else len(section)
        parts = []
        for later in heads[i + 1:]:
            if later.group(2).startswith('Etymology'):
                break
            if later.group(2) in POS_HEADINGS and later.group(2) not in parts:
                parts.append(later.group(2))
        out.append((title, section[head.end():end], parts))
    return out


# --- rendering ---------------------------------------------------------------------

GREEK_LETTERS = {
    'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'e', 'θ': 'th', 'ι': 'i',
    'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's',
    'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'ph', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
}
ROUGH = '̔'


def is_greek(text):
    return any('Ͱ' <= ch <= 'Ͽ' or 'ἀ' <= ch <= '῿' for ch in text)


def greek_to_latin(text):
    """Greek script in the spelling English dictionaries use for roots: sykophantes, chronos."""
    out = []
    for word in re.split(r'(\s+)', text):
        decomposed = unicodedata.normalize('NFD', word)
        rough = ROUGH in decomposed[:3]
        letters = [ch for ch in decomposed if not unicodedata.combining(ch)]
        result = ''
        for i, ch in enumerate(letters):
            low = ch.lower()
            prev = letters[i - 1].lower() if i > 0 else ''
            nxt = letters[i + 1].lower() if i + 1 < len(letters) else ''
            if low == 'γ' and nxt in 'γκξχ':
                piece = 'n'
            elif low == 'υ' and prev in 'αεηο':
                piece = 'u'
            elif low == 'ρ' and i == 0 and rough:
                piece = 'rh'
            else:
                piece = GREEK_LETTERS.get(low, ch)
            if ch != low and piece:
                piece = piece[0].upper() + piece[1:]
            result += piece
        if rough and letters and letters[0].lower() != 'ρ':
            result = ('H' + result[0].lower() + result[1:]) if result[:1].isupper() else 'h' + result
        out.append(result)
    return ''.join(out)


def lang_name(code):
    return LANGS.get(code, code)


def split_params(body):
    """Template parameters: positional values and named ones (t=, tr=, ...)."""
    parts = body.split('|')
    name = parts[0].strip()
    positional, named = [], {}
    for part in parts[1:]:
        m = re.match(r'^\s*([A-Za-z][\w-]*)\s*=(.*)$', part, re.S)
        if m:
            named[m.group(1)] = m.group(2).strip()
        else:
            positional.append(part.strip())
    return name, positional, named


def arg(values, i):
    return values[i] if i < len(values) else ''


def term_text(lang, term, alt='', tr='', gloss='', lit='', pos=''):
    """`term (transliteration, "gloss")`, as Wiktionary shows a mentioned word."""
    # Inline modifiers: cilium<t:eyelid><pos:noun>.
    mods = dict(re.findall(r'<(\w+):([^<>]*)>', term))
    term = re.sub(r'<\w+:[^<>]*>', '', term).strip()
    gloss = gloss or mods.get('t', '') or mods.get('gloss', '')
    tr = tr or mods.get('tr', '')
    alt = alt or mods.get('alt', '')
    lit = lit or mods.get('lit', '')
    pos = pos or mods.get('pos', '')
    shown = (alt or term).strip()
    if shown in ('-', ''):
        shown = ''
    extras = []
    if is_greek(shown):
        extras.append(greek_to_latin(shown))
    elif tr:
        extras.append(tr)
    if pos:
        extras.append(pos)
    if gloss:
        extras.append(f'"{gloss}"')
    if lit:
        extras.append(f'literally "{lit}"')
    if not shown:
        return ', '.join(extras)
    return shown + (f' ({", ".join(extras)})' if extras else '')


def with_lang(code, text):
    return f'{lang_name(code)} {text}'.strip() if text else lang_name(code)


def lead(phrase, named, text):
    """A phrase such as "Learned borrowing from" before the text, as Wiktionary shows it."""
    if not phrase or named.get('notext'):
        return text
    if named.get('nocap') and phrase[0].isupper():
        phrase = phrase[0].lower() + phrase[1:]
    return f'{phrase} {text}'


def affix_parts(lang, values, named, kind):
    """Each part of an af, prefix, suffix or confix template, with its gloss."""
    items = []
    for n, raw in enumerate(values, start=1):
        part_lang = named.get(f'lang{n}', lang)
        m = re.match(r'^([a-z]{2,3}(?:-[a-z]{2,4})*|[A-Z]{1,2}L\.):(.+)$', raw)
        if m and m.group(1) in LANGS:
            part_lang, raw = m.group(1), m.group(2)
        if kind == 'prefix' and n == 1 and raw and not raw.endswith('-'):
            raw += '-'
        if kind == 'suffix' and n == len(values) and raw and not raw.startswith('-'):
            raw = '-' + raw
        if kind == 'confix':
            if n == 1 and raw and not raw.endswith('-'):
                raw += '-'
            if n == len(values) and raw and not raw.startswith('-'):
                raw = '-' + raw
        text = term_text(
            part_lang, raw, named.get(f'alt{n}', ''), named.get(f'tr{n}', ''),
            named.get(f't{n}', '') or named.get(f'gloss{n}', ''), named.get(f'lit{n}', ''), named.get(f'pos{n}', ''),
        )
        if part_lang != lang and text:
            text = with_lang(part_lang, text)
        if text:
            items.append(text)
    return items


def render_template(body, unknown):
    name, values, named = split_params(body)
    key = name[:1].lower() + name[1:] if name else name
    gloss = lambda i: named.get('t', '') or named.get('gloss', '') or arg(values, i)  # noqa: E731
    if key in DERIVATION:
        text = term_text(arg(values, 1), arg(values, 2), arg(values, 3), named.get('tr', ''), gloss(4),
                         named.get('lit', ''), named.get('pos', ''))
        return lead(DERIVATION[key], named, with_lang(arg(values, 1), text))
    if key in MENTION:
        text = term_text(arg(values, 0), arg(values, 1), arg(values, 2), named.get('tr', ''), gloss(3),
                         named.get('lit', ''), named.get('pos', ''))
        return with_lang(arg(values, 0), text) if key == 'm+' else text
    if key in COGNATE:
        text = term_text(arg(values, 0), arg(values, 1), arg(values, 2), named.get('tr', ''), gloss(3))
        return with_lang(arg(values, 0), text)
    if key == 'etyl':
        return lang_name(arg(values, 0))
    if key in AFFIX or key in ('prefix', 'pre', 'suffix', 'suf', 'confix', 'con'):
        kind = {'pre': 'prefix', 'suf': 'suffix', 'con': 'confix'}.get(key, key)
        parts = affix_parts(arg(values, 0), [v for v in values[1:] if v], named, kind)
        return lead(AFFIX.get(key, ''), named, ' + '.join(parts))
    if key in ('doublet', 'dbt'):
        terms = [term_text(arg(values, 0), v) for v in values[1:] if v]
        return lead('Doublet of', named, ' and '.join(terms))
    if key in OF_TEMPLATES:
        text = term_text(arg(values, 0), arg(values, 1), arg(values, 2), named.get('tr', ''), gloss(3))
        return lead(OF_TEMPLATES[key], named, text)
    if key in ('named-after', 'coinage', 'coin'):
        who = named.get('wplink', '') or arg(values, 1)
        return lead('Named after' if key == 'named-after' else 'Coined by', named, who)
    if key in FIXED:
        return FIXED[key] if not named.get('nocap') else FIXED[key].lower()
    if key in QUALIFIER:
        return f'({", ".join(v for v in values if v)})'
    if key == 'nb...':
        return ' (and other forms)'
    if key == 'etydate':
        dates = [v for v in values if v]
        if dates[:1] == ['c']:
            dates = ['around ' + ' '.join(dates[1:])]
        return f'First attested in {" ".join(dates)}' if dates else ''
    if key == 'senseno':
        return f'sense "{arg(values, 1)}"'
    if key == 'lang':
        return arg(values, 1)
    if key in ('w', 'glossary'):
        return arg(values, 1) or arg(values, 0)
    if key in FIRST_ARG:
        return arg(values, 0)
    if key in INVISIBLE or key.startswith(('R:', 'r:', 'cite', 'quote', 'RQ:', 'ref')):
        return ''
    unknown.add(name)
    return ''


def strip_links(text):
    """[[target|shown]] becomes shown; images and categories go. Inner links first."""

    def link(m):
        target, shown = m.group(1), m.group(2)
        if re.match(r'^\s*(Category|File|Image|Thesaurus):', target, re.I):
            return ''
        return shown if shown is not None else re.sub(r'#.*$', '', target)

    while True:
        stripped = re.sub(r'\[\[([^\[\]|]*)(?:\|([^\[\]]*))?\]\]', link, text)
        if stripped == text:
            return text
        text = stripped


def render(wikitext):
    """Readable lines from a section's wikitext, and the template names left out."""
    text = re.sub(r'<!--.*?-->', '', wikitext, flags=re.S)
    text = re.sub(r'<ref[^>]*/>', '', text)
    text = re.sub(r'<ref[^>]*>.*?</ref>', '', text, flags=re.S)
    text = re.sub(r'\{\|.*?\|\}', '', text, flags=re.S)  # wiki tables (picture boxes)
    text = strip_links(text)
    unknown = set()
    innermost = re.compile(r'\{\{([^{}]*)\}\}')
    while True:
        rendered = innermost.sub(lambda m: render_template(m.group(1), unknown), text)
        if rendered == text:
            break
        text = rendered
    text = re.sub(r"'{2,}", '', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text).replace(' ', ' ')
    lines = []
    for line in text.split('\n'):
        line = re.sub(r'\s+', ' ', line.lstrip('*#:; ')).strip()
        line = re.sub(r'\s+([,.;:)])', r'\1', line).replace('( ', '(')
        line = re.sub(r'\(\s*\)', '', line).strip()
        if line and not re.fullmatch(r'[|{}\-]+', line):
            lines.append(line)
    return lines, unknown


def show(word, data, raw):
    print(f'=== {word}')
    if 'error' in data:
        print(f'  No Wiktionary page ({data["error"].get("code", "error")}).')
        return
    wikitext = data.get('parse', {}).get('wikitext', '')
    section = english_section(wikitext)
    if section is None:
        print('  The page has no English section.')
        return
    found = etymology_sections(section)
    if not found:
        print('  No Etymology section in the English entry.')
    for title, body, parts in found:
        label = f'{title} ({", ".join(parts)})' if parts else title
        lines, unknown = render(body)
        print(f'{label}:')
        for line in lines or ['(empty)']:
            print(f'  {line}')
        hedges = sorted({m.group(0).lower() for m in UNCERTAIN.finditer(' '.join(lines))})
        if hedges:
            print(f'  Note: Wiktionary hedges part of this origin ({", ".join(hedges)}). Say so, or leave that part out.')
        if unknown:
            print(f'  Templates not shown: {", ".join(sorted(unknown))}. Read the page for those.')
        if raw:
            print('  --- wikitext ---')
            for line in body.strip().split('\n'):
                print(f'  {line}')
    print(f'Source: {PAGE}{urllib.parse.quote(word)} (CC BY-SA). Check facts here; write the origin in your own words.')


def main():
    args = sys.argv[1:]
    raw = '--raw' in args
    refresh = '--refresh' in args
    words = [a for a in args if not a.startswith('--')]
    if not words:
        print(__doc__)
        sys.exit(1)
    failed = False
    for word in words:
        try:
            show(word, fetch(word, refresh), raw)
        except (urllib.error.URLError, RuntimeError, ValueError) as err:
            failed = True
            print(f'=== {word}\n  Could not fetch it: {err}', file=sys.stderr)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()

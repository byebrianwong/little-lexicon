// The "All words" view of the Words tab: a search box, filters and expandable
// rows. It owns the search text, the filters and which row is open, because
// those are screen-local; the word list itself comes from app/(app)/browse.tsx,
// and the title and view switch above it from WordsLayout. What each filter
// matches is in wordFilters.ts.
//
// The search also finds words near what was typed: similar and opposite
// words, words from the same root, close spellings and definitions
// (wordSearch.ts). A row found that way says why under its headword
// ("Similar to lessen"), so a list of near matches is not a puzzle.
//
// Each row is set like a dictionary entry: the word, its pronunciation, part
// of speech and tone label, then the definition. Opening a row adds the
// "Watch out" note, an example (with a control to step through the others),
// every extra line (components/WordExtras), the memory hook, audio and the
// Save control. This is the reference view, so it shows all the extras. A
// "Same root" word is a link: it searches for that word and opens its row.
// So is each "Similar" and "Opposite" word: it searches for that word, and
// opens its row when the word is in the collection.

import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import {
  Body,
  Choice,
  ChoiceGroup,
  Column,
  Label,
  Muted,
  Note,
  Row,
  Section,
  Spinner,
  TextButton,
  TextField,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/colors';
import { speakDefinition, speakHook, speakSentence, speakWord } from '@/lib/audio';
import { pickExample } from '@/lib/examples';
import type { WordContent } from '@/lib/types';
import { EXTRA_LINES, wordExtras, type RootWord } from '@/lib/wordExtras';
import { ExtraLines, ToneLabel, WatchOut } from '@/components/WordExtras';
import { ReportProblem } from '@/features/report/ReportProblem';
import { SaveWordButton } from '@/features/feed/SaveWordButton';
import type { WordTracker } from '@/features/tracker/tracker';
import {
  activeFilterCount,
  findWords,
  NO_FILTERS,
  partsOfSpeech,
  searchForWord,
  STATUS_FILTERS,
  TIERS,
  toggleTier,
  type WordFilters,
} from './wordFilters';
import {
  buildSearchIndex,
  matchNote,
  wordNamed,
  type SearchHit,
  type SearchMatch,
} from './wordSearch';

export interface BrowseViewProps {
  words: WordContent[] | undefined;
  isLoading: boolean;
  soundEnabled: boolean;
  savedIds: ReadonlySet<number>;
  /** For the status filter: learning, known or not tested yet. */
  trackers: ReadonlyMap<number, WordTracker>;
  onToggleSave: (word: WordContent) => void;
  /** Open the filters on first render. For stories. */
  initialFiltersOpen?: boolean;
  /**
   * Put the cursor in the search box (and bring up the keyboard). The view
   * calls onSearchFocused once it has, so the screen can turn this off.
   */
  focusSearch?: boolean;
  onSearchFocused?: () => void;
}

export function BrowseView({
  words,
  isLoading,
  soundEnabled,
  savedIds,
  trackers,
  onToggleSave,
  initialFiltersOpen = false,
  focusSearch = false,
  onSearchFocused,
}: BrowseViewProps) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [filters, setFilters] = useState<WordFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(initialFiltersOpen);
  const listRef = useRef<FlatList<SearchHit>>(null);
  const searchRef = useRef<TextInput>(null);

  // The search button can open this view, which mounts it. On iOS a focus()
  // call in the first effect comes before the native input is ready and is
  // lost, so a view opened that way asks through autoFocus, which the input
  // applies once it is on screen. The value is kept for the view's life, so
  // turning focusSearch off does not change it. The effect covers a press
  // while the view is already open.
  const [focusOnMount] = useState(focusSearch);
  useEffect(() => {
    if (!focusSearch) return;
    searchRef.current?.focus();
    onSearchFocused?.();
  }, [focusSearch, onSearchFocused]);

  // Built once per word list, so each keystroke only compares strings.
  const index = useMemo(() => buildSearchIndex(words ?? []), [words]);
  const hits = useMemo(
    () => findWords(index, query, filters, { savedIds, trackers }),
    [index, query, filters, savedIds, trackers],
  );
  const parts = useMemo(() => partsOfSpeech(words ?? []), [words]);
  const active = activeFilterCount(filters);

  // The list keeps its offset after a link changes the search, which would
  // leave the top results above the top of the shorter list.
  function scrollToTop() {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }

  // Search for a word in the collection and open its row. Filters that would
  // hide it are cleared (wordFilters searchForWord).
  function goToWord(target: WordContent) {
    const next = searchForWord(target, filters, { savedIds, trackers });
    setQuery(next.query);
    setFilters(next.filters);
    setOpenId(target.wordId);
    scrollToTop();
  }

  // A "Same root" link.
  function goToRootWord(root: RootWord) {
    const target = words?.find((w) => w.wordId === root.wordId);
    if (target) goToWord(target);
  }

  // A "Similar" or "Opposite" link. A word in the collection opens like a
  // "Same root" link. Any other word becomes the search, which lists the
  // words near it, with every row closed so they can be scanned.
  function searchRelated(text: string) {
    const target = wordNamed(index, text);
    if (target) {
      goToWord(target);
      return;
    }
    setQuery(text);
    setOpenId(null);
    scrollToTop();
  }

  return (
    <View className="flex-1">
      <Column className="px-6 pt-4">
        <Row className="items-end gap-4">
          <TextField
            ref={searchRef}
            autoFocus={focusOnMount}
            value={query}
            onChangeText={setQuery}
            placeholder="Search words and meanings"
            accessibilityLabel="Search words and meanings"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 text-[18px]"
          />
          <Note className="pb-3">{`${hits.length} ${hits.length === 1 ? 'entry' : 'entries'}`}</Note>
        </Row>
        <Row className="items-center justify-between">
          <TextButton
            label={active > 0 ? `Filters (${active})` : 'Filters'}
            icon={filtersOpen ? 'chevron-up' : 'chevron-down'}
            accessibilityLabel={`${filtersOpen ? 'Hide' : 'Show'} filters${active > 0 ? `, ${active} on` : ''}`}
            onPress={() => setFiltersOpen(!filtersOpen)}
          />
          {active > 0 ? (
            <TextButton label="Clear filters" onPress={() => setFilters(NO_FILTERS)} />
          ) : null}
        </Row>
        {filtersOpen ? (
          <View className="gap-4 pb-3">
            <FilterGroup label="Tier">
              <Choice
                label="Any"
                accessibilityLabel="Any tier"
                selected={filters.tiers.length === 0}
                onPress={() => setFilters({ ...filters, tiers: [] })}
              />
              {TIERS.map((t) => (
                <Choice
                  key={t}
                  label={String(t)}
                  accessibilityLabel={`Tier ${t}`}
                  selected={filters.tiers.includes(t)}
                  onPress={() => setFilters(toggleTier(filters, t))}
                />
              ))}
            </FilterGroup>
            <FilterGroup label="Status">
              {STATUS_FILTERS.map((s) => (
                <Choice
                  key={s.id}
                  label={s.label}
                  accessibilityLabel={s.id === 'any' ? 'Any status' : s.label}
                  selected={filters.status === s.id}
                  onPress={() => setFilters({ ...filters, status: s.id })}
                />
              ))}
            </FilterGroup>
            <FilterGroup label="Part of speech">
              <Choice
                label="Any"
                accessibilityLabel="Any part of speech"
                selected={filters.partOfSpeech === null}
                onPress={() => setFilters({ ...filters, partOfSpeech: null })}
              />
              {parts.map((p) => (
                <Choice
                  key={p}
                  label={p}
                  selected={filters.partOfSpeech === p}
                  onPress={() => setFilters({ ...filters, partOfSpeech: p })}
                />
              ))}
            </FilterGroup>
          </View>
        ) : null}
      </Column>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Spinner size="large" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={hits}
          keyExtractor={(hit) => String(hit.word.wordId)}
          contentContainerStyle={{
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: 48,
          }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Note className="mt-8 text-center">
              {active > 0 ? 'No word matches these filters.' : 'No word matches that search.'}
            </Note>
          }
          renderItem={({ item, index: at }) => (
            <WordRow
              word={item.word}
              match={item.match}
              collection={words ?? []}
              onRootWord={goToRootWord}
              onRelatedWord={searchRelated}
              first={at === 0}
              expanded={openId === item.word.wordId}
              onToggle={() => setOpenId(openId === item.word.wordId ? null : item.word.wordId)}
              soundEnabled={soundEnabled}
              saved={savedIds.has(item.word.wordId)}
              onToggleSave={() => onToggleSave(item.word)}
            />
          )}
        />
      )}
    </View>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Label>{label}</Label>
      <ChoiceGroup className="mt-2">{children}</ChoiceGroup>
    </View>
  );
}

function WordRow({
  word,
  match,
  collection,
  onRootWord,
  onRelatedWord,
  first,
  expanded,
  onToggle,
  soundEnabled,
  saved,
  onToggleSave,
}: {
  word: WordContent;
  /** Why the search found this word. */
  match: SearchMatch;
  /** Every word, for "Same root". */
  collection: readonly WordContent[];
  onRootWord: (word: RootWord) => void;
  onRelatedWord: (word: string) => void;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
  soundEnabled: boolean;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const sense = word.senses[0];
  const examples = sense?.examples ?? [];
  // Which example is shown: the first, until the learner steps to the next.
  const [exampleStep, setExampleStep] = useState(0);
  const example = pickExample(examples, exampleStep);
  const nextStep = examples.length > 0 ? (exampleStep + 1) % examples.length : 0;
  const definition = sense?.plainLanguageDefinition ?? sense?.definition ?? '';
  const extras = useMemo(() => wordExtras(word, collection), [word, collection]);
  const note = matchNote(match);
  const noteText = note ? [note.label, note.word].filter(Boolean).join(' ') : null;

  // The toggle and the audio controls are siblings, never nested. React Native
  // Web renders every Pressable as a <button>, and a button inside a button is
  // invalid HTML that breaks hydration.
  return (
    <View className={first ? 'pt-2' : 'border-t border-rule'}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${word.headword}${noteText ? `, ${noteText.toLowerCase()}` : ''}. ${expanded ? 'Collapse' : 'Expand'}`}
        accessibilityState={{ expanded }}
        className="py-4 active:bg-paper-deep web:hover:bg-paper-deep"
      >
        <Row className="items-start justify-between gap-3">
          <View className="flex-1 flex-row flex-wrap items-baseline gap-x-2">
            <Body className="font-serif-medium text-[24px] leading-[30px]">
              {word.headword}
            </Body>
            {word.ipa ? <Muted className="text-[15px]">{word.ipa}</Muted> : null}
            {word.partOfSpeech ? (
              <Note className="text-[15px]">{word.partOfSpeech}</Note>
            ) : null}
            <ToneLabel tone={extras.tone} />
          </View>
          <Row className="gap-2 pt-[6px]">
            <Label>{`Tier ${word.difficultyTier}`}</Label>
            <Icon
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.graphite}
            />
          </Row>
        </Row>
        {note ? (
          // Set like the extra lines: a small-caps label, then the word.
          <Muted className="mt-1">
            <Label className="leading-[23px]">{note.label}</Label>
            {note.word ? `  ${note.word}` : null}
          </Muted>
        ) : null}
        <Body className="mt-1">{definition}</Body>
      </Pressable>

      {expanded ? (
        <View className="gap-3 pb-5">
          <WatchOut note={extras.watchOut} />
          {example ? (
            <View>
              {/* Read out when it changes, so "Next example" is heard to work. */}
              <Note
                accessibilityLiveRegion="polite"
                className="text-[17px] leading-[25px]"
              >{`“${example.text}”`}</Note>
              {examples.length > 1 ? (
                <TextButton
                  icon="arrow-right"
                  label="Next example"
                  accessibilityLabel={`Next example, ${nextStep + 1} of ${examples.length}`}
                  onPress={() => setExampleStep(nextStep)}
                />
              ) : null}
            </View>
          ) : null}

          <ExtraLines
            extras={extras}
            lines={EXTRA_LINES}
            onRootWord={onRootWord}
            onRelatedWord={onRelatedWord}
          />

          {word.mnemonics[0] ? (
            <Section label="Memory hook" rule="hairline" className="mt-1">
              <Body className="text-[17px] leading-[25px]">{word.mnemonics[0]}</Body>
            </Section>
          ) : null}

          <Row className="flex-wrap gap-x-6">
            <TextButton
              icon="speaker"
              label="Word"
              accessibilityLabel={`Hear ${word.headword}`}
              onPress={() => {
                if (soundEnabled) void speakWord(word);
              }}
            />
            {sense ? (
              <TextButton
                icon="speaker"
                label="Definition"
                accessibilityLabel="Definition: hear it read out"
                onPress={() => {
                  if (soundEnabled) void speakDefinition(sense);
                }}
              />
            ) : null}
            {example ? (
              <TextButton
                icon="speaker"
                label="Sentence"
                accessibilityLabel="Hear the example sentence"
                onPress={() => {
                  if (soundEnabled) void speakSentence(example);
                }}
              />
            ) : null}
            {word.mnemonics[0] ? (
              <TextButton
                icon="speaker"
                label="Hook"
                accessibilityLabel="Memory hook: hear it read out"
                onPress={() => {
                  if (soundEnabled) void speakHook(word);
                }}
              />
            ) : null}
          </Row>

          <SaveWordButton headword={word.headword} saved={saved} onPress={onToggleSave} />

          <ReportProblem wordId={word.wordId} headword={word.headword} screen="browse" />
        </View>
      ) : null}
    </View>
  );
}

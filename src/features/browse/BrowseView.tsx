// The "All words" view of the Words tab: a search box, filters and expandable
// rows. It owns the search text, the filters and which row is open, because
// those are screen-local; the word list itself comes from app/(app)/browse.tsx,
// and the title and view switch above it from WordsLayout. What each filter
// matches is in wordFilters.ts.
//
// Each row is set like a dictionary entry: the word, its pronunciation and
// part of speech, then the definition. Opening a row adds the example, the
// memory hook, audio and the Save control.

import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
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
import { speakDefinition, speakSentence, speakWord } from '@/lib/audio';
import type { WordContent } from '@/lib/types';
import { ReportProblem } from '@/features/report/ReportProblem';
import { SaveWordButton } from '@/features/feed/SaveWordButton';
import type { WordTracker } from '@/features/tracker/tracker';
import {
  activeFilterCount,
  filterWords,
  NO_FILTERS,
  partsOfSpeech,
  STATUS_FILTERS,
  TIERS,
  toggleTier,
  type WordFilters,
} from './wordFilters';

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
}

export function BrowseView({
  words,
  isLoading,
  soundEnabled,
  savedIds,
  trackers,
  onToggleSave,
  initialFiltersOpen = false,
}: BrowseViewProps) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [filters, setFilters] = useState<WordFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(initialFiltersOpen);

  const filtered = useMemo(
    () => filterWords(words ?? [], query, filters, { savedIds, trackers }),
    [words, query, filters, savedIds, trackers],
  );
  const parts = useMemo(() => partsOfSpeech(words ?? []), [words]);
  const active = activeFilterCount(filters);

  return (
    <View className="flex-1">
      <Column className="px-6 pt-4">
        <Row className="items-end gap-4">
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder="Search words and meanings"
            accessibilityLabel="Search words and meanings"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 text-[18px]"
          />
          <Note className="pb-3">{`${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`}</Note>
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
          data={filtered}
          keyExtractor={(w) => String(w.wordId)}
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
          renderItem={({ item, index }) => (
            <WordRow
              word={item}
              first={index === 0}
              expanded={openId === item.wordId}
              onToggle={() => setOpenId(openId === item.wordId ? null : item.wordId)}
              soundEnabled={soundEnabled}
              saved={savedIds.has(item.wordId)}
              onToggleSave={() => onToggleSave(item)}
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
  first,
  expanded,
  onToggle,
  soundEnabled,
  saved,
  onToggleSave,
}: {
  word: WordContent;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
  soundEnabled: boolean;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const sense = word.senses[0];
  const example = sense?.examples[0];
  const definition = sense?.plainLanguageDefinition ?? sense?.definition ?? '';

  // The toggle and the audio controls are siblings, never nested. React Native
  // Web renders every Pressable as a <button>, and a button inside a button is
  // invalid HTML that breaks hydration.
  return (
    <View className={first ? 'pt-2' : 'border-t border-rule'}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${word.headword}. ${expanded ? 'Collapse' : 'Expand'}`}
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
        <Body className="mt-1">{definition}</Body>
      </Pressable>

      {expanded ? (
        <View className="gap-3 pb-5">
          {example ? (
            <Note className="text-[17px] leading-[25px]">{`“${example.text}”`}</Note>
          ) : null}

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
          </Row>

          <SaveWordButton headword={word.headword} saved={saved} onPress={onToggleSave} />

          <ReportProblem wordId={word.wordId} headword={word.headword} screen="browse" />
        </View>
      ) : null}
    </View>
  );
}

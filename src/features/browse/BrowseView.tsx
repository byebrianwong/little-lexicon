// The browse screen's layout, search box and expandable rows. It owns the
// search text and which row is open, because those are screen-local; the word
// list itself comes from app/(app)/browse.tsx.
//
// Each row is set like a dictionary entry: the word, its pronunciation and
// part of speech, then the definition. Opening a row adds the example, the
// memory hook and audio.

import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Body,
  Column,
  H1,
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
import { speakSentence, speakWord } from '@/lib/audio';
import type { WordContent } from '@/lib/types';

export interface BrowseViewProps {
  words: WordContent[] | undefined;
  isLoading: boolean;
  soundEnabled: boolean;
}

export function BrowseView({ words, isLoading, soundEnabled }: BrowseViewProps) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const all = words ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((w) => {
      if (w.headword.toLowerCase().includes(q)) return true;
      return w.senses.some(
        (s) =>
          s.definition.toLowerCase().includes(q) ||
          (s.plainLanguageDefinition ?? '').toLowerCase().includes(q),
      );
    });
  }, [words, query]);

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <Column className="px-6 pt-10">
        <Row className="items-baseline justify-between">
          <H1>Words</H1>
          <Note>{`${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`}</Note>
        </Row>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search words and meanings"
          accessibilityLabel="Search words and meanings"
          autoCapitalize="none"
          autoCorrect={false}
          className="mt-4 text-[18px]"
        />
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
            <Note className="mt-8 text-center">No word matches that search.</Note>
          }
          renderItem={({ item, index }) => (
            <WordRow
              word={item}
              first={index === 0}
              expanded={openId === item.wordId}
              onToggle={() => setOpenId(openId === item.wordId ? null : item.wordId)}
              soundEnabled={soundEnabled}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function WordRow({
  word,
  first,
  expanded,
  onToggle,
  soundEnabled,
}: {
  word: WordContent;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
  soundEnabled: boolean;
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

          <Row className="gap-6">
            <TextButton
              icon="speaker"
              label="Word"
              accessibilityLabel={`Hear ${word.headword}`}
              onPress={() => {
                if (soundEnabled) void speakWord(word.headword, word.audioUrl);
              }}
            />
            {example ? (
              <TextButton
                icon="speaker"
                label="Sentence"
                accessibilityLabel="Hear the example sentence"
                onPress={() => {
                  if (soundEnabled) void speakSentence(example.text, example.audioUrl);
                }}
              />
            ) : null}
          </Row>
        </View>
      ) : null}
    </View>
  );
}

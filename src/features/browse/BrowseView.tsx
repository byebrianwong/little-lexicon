// The browse screen's layout, search box and expandable rows. It owns the
// search text and which row is open, because those are screen-local; the word
// list itself comes from app/(app)/browse.tsx.

import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, H1, H2, Muted, Pill, Row } from '@/components/ui';
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
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-5">
        <Row className="justify-between">
          <H1>Words</H1>
          <Muted>{`${filtered.length}`}</Muted>
        </Row>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search words and meanings"
          placeholderTextColor="#6B7796"
          autoCapitalize="none"
          autoCorrect={false}
          className="mt-4 rounded-2xl bg-surface2 px-4 py-3 text-text"
        />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6C8CFF" size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(w) => String(w.wordId)}
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Muted className="mt-8 text-center">No word matches that search.</Muted>
          }
          renderItem={({ item }) => (
            <WordRow
              word={item}
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
  expanded,
  onToggle,
  soundEnabled,
}: {
  word: WordContent;
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
    <Card>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${word.headword}. ${expanded ? 'Collapse' : 'Expand'}`}
      >
        <Row className="justify-between">
          <View className="flex-1 pr-3">
            <Row className="items-baseline gap-2">
              <H2>{word.headword}</H2>
              {word.ipa ? <Muted>{word.ipa}</Muted> : null}
            </Row>
            {word.partOfSpeech ? <Muted className="mt-1">{word.partOfSpeech}</Muted> : null}
          </View>
          <Pill tone="neutral">{`T${word.difficultyTier}`}</Pill>
        </Row>

        <Text className="text-text mt-3">{definition}</Text>
      </Pressable>

      {expanded ? (
        <View className="mt-3 gap-3">
          {example ? <Text className="text-muted italic">{`"${example.text}"`}</Text> : null}

          {word.mnemonics[0] ? (
            <View className="rounded-2xl bg-surface2 p-3">
              <Muted>Memory hook</Muted>
              <Text className="text-text mt-1">{word.mnemonics[0]}</Text>
            </View>
          ) : null}

          <Row className="gap-3">
            <SmallButton
              label="🔊 Word"
              onPress={() => {
                if (soundEnabled) void speakWord(word.headword, word.audioUrl);
              }}
            />
            {example ? (
              <SmallButton
                label="🔊 Sentence"
                onPress={() => {
                  if (soundEnabled) void speakSentence(example.text, example.audioUrl);
                }}
              />
            ) : null}
          </Row>
        </View>
      ) : null}
    </Card>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="rounded-full bg-surface2 px-4 py-2"
    >
      <Text className="text-text">{label}</Text>
    </Pressable>
  );
}

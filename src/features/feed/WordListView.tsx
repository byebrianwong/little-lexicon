// "Your list": the words picked in Discover that no session has shown yet.
// Sessions take them first, oldest first, so this is also what comes next. A
// word leaves the list when a session introduces it.

import { FlatList, View } from 'react-native';
import {
  Body,
  Button,
  Muted,
  Note,
  Row,
  Spinner,
  TextButton,
} from '@/components/ui';
import type { ListedWord } from '@/lib/types';

export interface WordListViewProps {
  entries: ListedWord[] | undefined;
  isLoading: boolean;
  onRemove: (wordId: number) => void;
  onStartSession: () => void;
  onDiscover: () => void;
}

export function WordListView({
  entries,
  isLoading,
  onRemove,
  onStartSession,
  onDiscover,
}: WordListViewProps) {
  if (isLoading || !entries) {
    return (
      <View className="flex-1 items-center justify-center">
        <Spinner size="large" />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View className="flex-1 w-full max-w-[640px] self-center px-6 pt-8">
        <Body>Your list is empty.</Body>
        <Muted className="mt-2">
          Tap Learn this on a word in Discover and it waits here until a session
          introduces it.
        </Muted>
        <View className="mt-6">
          <Button title="Go to Discover" variant="secondary" onPress={onDiscover} />
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => String(e.content.wordId)}
      contentContainerStyle={{
        width: '100%',
        maxWidth: 640,
        alignSelf: 'center',
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 48,
      }}
      ListHeaderComponent={
        <View className="mb-4 gap-4">
          <Muted>Your next session starts with these, in this order.</Muted>
          <Button title="Start a session" trailingIcon="arrow-right" onPress={onStartSession} />
        </View>
      }
      renderItem={({ item, index }) => {
        const sense = item.content.senses[0];
        const definition = sense?.plainLanguageDefinition ?? sense?.definition ?? '';
        return (
          <View className={index === 0 ? 'border-t border-ink py-4' : 'border-t border-rule py-4'}>
            <Row className="items-start justify-between gap-3">
              <View className="flex-1 flex-row flex-wrap items-baseline gap-x-2">
                <Body className="font-serif-medium text-[24px] leading-[30px]">
                  {item.content.headword}
                </Body>
                {item.content.partOfSpeech ? (
                  <Note className="text-[15px]">{item.content.partOfSpeech}</Note>
                ) : null}
              </View>
              <TextButton
                label="Remove"
                accessibilityLabel={`Remove ${item.content.headword} from your list`}
                onPress={() => onRemove(item.content.wordId)}
              />
            </Row>
            <Body className="mt-1">{definition}</Body>
          </View>
        );
      }}
    />
  );
}

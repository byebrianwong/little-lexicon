// "Saved": every word the user saved, newest first, to look back at whenever
// they like. A word stays until the user removes it. Under each one, the
// tracker says how it is going (features/tracker).
//
// Saved words also feed the games: a session introduces the ones it has not
// shown yet before any other new word, and practice shows them more often.

import { FlatList, View } from 'react-native';
import {
  Body,
  Button,
  Label,
  Muted,
  Note,
  Row,
  Spinner,
  TextButton,
} from '@/components/ui';
import type { ListedWord } from '@/lib/types';
import { describeTracker, type WordTracker } from '@/features/tracker/tracker';

export interface WordListViewProps {
  /** Oldest first, as the backend returns them. The view shows newest first. */
  entries: ListedWord[] | undefined;
  isLoading: boolean;
  trackers: ReadonlyMap<number, WordTracker>;
  onRemove: (wordId: number) => void;
  onStartSession: () => void;
  onPractice: () => void;
  onDiscover: () => void;
}

export function WordListView({
  entries,
  isLoading,
  trackers,
  onRemove,
  onStartSession,
  onPractice,
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
        <Body>No saved words yet.</Body>
        <Muted className="mt-2">
          Tap Save for later on any word, in Discover, a session, practice or All words.
          It stays here until you remove it.
        </Muted>
        <View className="mt-6">
          <Button title="Go to Discover" variant="secondary" onPress={onDiscover} />
        </View>
      </View>
    );
  }

  const newestFirst = [...entries].reverse();
  const now = new Date();

  return (
    <FlatList
      data={newestFirst}
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
          <Muted>
            Sessions start with saved words you have not learned yet, and practice shows
            saved words more often.
          </Muted>
          <Button title="Start a session" trailingIcon="arrow-right" onPress={onStartSession} />
          <Button title="Practice" variant="secondary" onPress={onPractice} />
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
                <Label>{`Tier ${item.content.difficultyTier}`}</Label>
              </View>
              <TextButton
                label="Remove"
                accessibilityLabel={`Remove ${item.content.headword} from saved words`}
                onPress={() => onRemove(item.content.wordId)}
              />
            </Row>
            <Body className="mt-1">{definition}</Body>
            <Note className="mt-2 text-[15px]">
              {describeTracker(trackers.get(item.content.wordId), now)}
            </Note>
          </View>
        );
      }}
    />
  );
}

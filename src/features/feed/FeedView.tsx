// The Discover feed: unseen words, one per screen, scrolled like a stack of
// pages. For each word the reader can add it to their list, say they know it,
// or scroll on, which records nothing.
//
// Two problems with feeds like this shaped the design:
//
// - A stray tap must not lose a word. Tapping the page does nothing; only the
//   buttons act. Scrolling back always shows the same word again, because the
//   loaded words never change order.
// - Each choice can be undone. The card swaps its buttons for a line saying
//   what happened and an Undo.
//
// The screen owns the words, the marks and every write (app/(app)/browse.tsx).
// This view lays them out and reports which word is on screen.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import {
  Body,
  Button,
  H2,
  Headword,
  Label,
  Muted,
  Note,
  Row,
  Spinner,
  TextButton,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/colors';
import { speakSentence, speakWord } from '@/lib/audio';
import type { WordContent } from '@/lib/types';
import type { FeedStatus } from './feedState';

export interface FeedViewProps {
  words: WordContent[];
  isLoading: boolean;
  isLoadingMore: boolean;
  /** The last page failed to load. */
  failed: boolean;
  /** Every unseen word has been loaded. */
  exhausted: boolean;
  onLoadMore: () => void;
  /** Words with no entry are untouched. */
  statuses: Readonly<Record<number, FeedStatus>>;
  onLearn: (word: WordContent) => void;
  onUnlearn: (word: WordContent) => void;
  onKnow: (word: WordContent) => void;
  onUnknow: (word: WordContent) => void;
  /** The word filling the screen, or null on the closing page. */
  onVisibleWord: (wordId: number | null) => void;
  /** A write failed; shown above the feed until the next action. */
  notice: string | null;
  listCount: number;
  onOpenList: () => void;
  onStartSession: () => void;
  soundEnabled: boolean;
}

type Page =
  | { kind: 'word'; word: WordContent }
  | { kind: 'more' }
  | { kind: 'end' };

const pageKey = (p: Page) => (p.kind === 'word' ? String(p.word.wordId) : p.kind);

const HINT = Platform.OS === 'web' ? 'Scroll for the next word' : 'Swipe up for the next word';

export function FeedView(props: FeedViewProps) {
  const { words, isLoading, failed, exhausted, isLoadingMore, onLoadMore } = props;
  // Every page is exactly as tall as the feed, so paging lands on one word.
  // Keep the last real height: a hidden feed reports zero.
  const [height, setHeight] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) setHeight(h);
  }, []);

  const pages = useMemo<Page[]>(() => {
    const out: Page[] = words.map((word) => ({ kind: 'word', word }));
    if (exhausted) out.push({ kind: 'end' });
    else if (failed || isLoadingMore) out.push({ kind: 'more' });
    return out;
  }, [words, exhausted, failed, isLoadingMore]);

  // FlatList requires the same callback for its whole life, so it reads the
  // latest prop through a ref.
  const onVisibleRef = useRef(props.onVisibleWord);
  onVisibleRef.current = props.onVisibleWord;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const top = viewableItems[0]?.item as Page | undefined;
    if (!top) return;
    onVisibleRef.current(top.kind === 'word' ? top.word.wordId : null);
  }).current;

  // The measuring view is rendered from the first frame. React Native Web only
  // starts watching an element's size if it has onLayout when it mounts, and a
  // loading branch with its own root view would be reused for the feed.
  return (
    <View className="flex-1" onLayout={onLayout}>
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Spinner size="large" />
        </View>
      ) : words.length === 0 && failed ? (
        <View className="flex-1 w-full max-w-[640px] self-center justify-center px-6">
          <Body>Could not load new words.</Body>
          <Muted className="mt-2">Check your connection, then try again.</Muted>
          <View className="mt-6">
            <Button title="Try again" variant="secondary" onPress={onLoadMore} />
          </View>
        </View>
      ) : (
        <FeedPages {...props} pages={pages} height={height} onViewable={onViewable} />
      )}
    </View>
  );
}

function FeedPages({
  pages,
  height,
  onViewable,
  ...props
}: FeedViewProps & {
  pages: Page[];
  height: number;
  onViewable: (info: { viewableItems: ViewToken[] }) => void;
}) {
  const { failed, exhausted, onLoadMore } = props;
  return (
    <>
      {height > 0 ? (
        <FlatList
          data={pages}
          keyExtractor={pageKey}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          initialNumToRender={2}
          maxToRenderPerBatch={3}
          windowSize={5}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onEndReached={() => {
            if (!exhausted && !failed) onLoadMore();
          }}
          onEndReachedThreshold={3}
          renderItem={({ item, index }) => (
            <View style={{ height }}>
              {item.kind === 'word' ? (
                <WordPage
                  word={item.word}
                  status={props.statuses[item.word.wordId] ?? 'none'}
                  showHint={index === 0}
                  soundEnabled={props.soundEnabled}
                  onLearn={props.onLearn}
                  onUnlearn={props.onUnlearn}
                  onKnow={props.onKnow}
                  onUnknow={props.onUnknow}
                />
              ) : item.kind === 'more' ? (
                <MorePage failed={failed} onRetry={onLoadMore} />
              ) : (
                <EndPage
                  listCount={props.listCount}
                  onOpenList={props.onOpenList}
                  onStartSession={props.onStartSession}
                />
              )}
            </View>
          )}
        />
      ) : null}
      {/* Laid over the top of the page, so it never changes the page height. */}
      {props.notice ? (
        <View
          accessibilityLiveRegion="polite"
          className="absolute left-0 right-0 top-0 border-b border-rule bg-paper"
        >
          <View className="w-full max-w-[640px] self-center px-6 py-3">
            <Note className="text-accent">{props.notice}</Note>
          </View>
        </View>
      ) : null}
    </>
  );
}

function WordPage({
  word,
  status,
  showHint,
  soundEnabled,
  onLearn,
  onUnlearn,
  onKnow,
  onUnknow,
}: {
  word: WordContent;
  status: FeedStatus;
  showHint: boolean;
  soundEnabled: boolean;
  onLearn: (word: WordContent) => void;
  onUnlearn: (word: WordContent) => void;
  onKnow: (word: WordContent) => void;
  onUnknow: (word: WordContent) => void;
}) {
  const sense = word.senses[0];
  const example = sense?.examples[0];
  const definition = sense?.plainLanguageDefinition ?? sense?.definition ?? '';

  return (
    <View className="flex-1 w-full max-w-[640px] self-center px-6 pb-6">
      <View className="flex-1 justify-center">
        <View className="flex-row flex-wrap items-baseline gap-x-3">
          <Headword>{word.headword}</Headword>
          {word.ipa ? <Muted>{word.ipa}</Muted> : null}
        </View>
        {word.partOfSpeech ? (
          <Note className="mt-1 text-[17px]">{word.partOfSpeech}</Note>
        ) : null}

        <View className="mt-6 border-t border-ink pt-4">
          <Body className="text-[20px] leading-[29px]">{definition}</Body>
          {example ? (
            <Note className="mt-3 text-[17px] leading-[25px]">{`“${example.text}”`}</Note>
          ) : null}
          <Row className="mt-2 gap-6">
            <TextButton
              icon="speaker"
              label="Hear it"
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
      </View>

      <Actions
        word={word}
        status={status}
        onLearn={onLearn}
        onUnlearn={onUnlearn}
        onKnow={onKnow}
        onUnknow={onUnknow}
      />
      {showHint ? <Note className="mt-3 text-center text-[15px]">{HINT}</Note> : null}
    </View>
  );
}

function Actions({
  word,
  status,
  onLearn,
  onUnlearn,
  onKnow,
  onUnknow,
}: {
  word: WordContent;
  status: FeedStatus;
  onLearn: (word: WordContent) => void;
  onUnlearn: (word: WordContent) => void;
  onKnow: (word: WordContent) => void;
  onUnknow: (word: WordContent) => void;
}) {
  // One fixed height for every state, so the page does not jump.
  const box = 'min-h-[52px]';

  if (status === 'none') {
    return (
      <Row className={`${box} gap-3`}>
        <Button
          title="I know it"
          variant="secondary"
          // Starts with the visible text, so voice control finds it, and
          // names the word, because nearby pages have the same buttons.
          accessibilityLabel={`I know it: ${word.headword}`}
          className="flex-1"
          onPress={() => onKnow(word)}
        />
        <Button
          title="Learn this"
          accessibilityLabel={`Learn this: ${word.headword}`}
          className="flex-1"
          onPress={() => onLearn(word)}
        />
      </Row>
    );
  }

  const message = status === 'listed' ? 'On your list' : 'Marked as known';
  // A stored "known" has no undo: see feedState for why.
  const undo =
    status === 'listed'
      ? { label: `Undo: take ${word.headword} off your list`, run: () => onUnlearn(word) }
      : status === 'pendingKnown'
        ? { label: `Undo: ${word.headword} is not known`, run: () => onUnknow(word) }
        : null;

  return (
    <Row className={`${box} items-center justify-between gap-3 border-t border-rule`}>
      <Row className="items-center gap-2">
        <Icon name="check" size={20} color={colors.accent} />
        <Body accessibilityLiveRegion="polite">{message}</Body>
      </Row>
      {undo ? <TextButton label="Undo" accessibilityLabel={undo.label} onPress={undo.run} /> : null}
    </Row>
  );
}

function MorePage({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return (
    <View className="flex-1 w-full max-w-[640px] self-center justify-center px-6">
      {failed ? (
        <>
          <Body>Could not load more words.</Body>
          <View className="mt-6">
            <Button title="Try again" variant="secondary" onPress={onRetry} />
          </View>
        </>
      ) : (
        <View className="items-center">
          <Spinner size="large" />
        </View>
      )}
    </View>
  );
}

function EndPage({
  listCount,
  onOpenList,
  onStartSession,
}: {
  listCount: number;
  onOpenList: () => void;
  onStartSession: () => void;
}) {
  return (
    <View className="flex-1 w-full max-w-[640px] self-center justify-center px-6">
      <Label>The end</Label>
      <H2 className="mt-2">That is every new word.</H2>
      <Muted className="mt-3">
        Words you scrolled past come back the next time you open the app.
      </Muted>
      {listCount > 0 ? (
        <View className="mt-8 gap-3">
          <Button title="Start a session" trailingIcon="arrow-right" onPress={onStartSession} />
          <Button
            title={`See your list (${listCount})`}
            variant="secondary"
            onPress={onOpenList}
          />
        </View>
      ) : null}
    </View>
  );
}

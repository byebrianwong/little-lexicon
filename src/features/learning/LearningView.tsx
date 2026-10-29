// The "Learning" view of the Words tab: every word the learner has started,
// with how each one is going. A switch at the top picks one of three lists
// (features/learning/wordProgress.ts says what each holds), and Home and
// Progress open the view on the list whose count was tapped.
//
// Each row shows the word and its definition, a meter of the days toward
// known, and a line with the answers and the next review. Opening a row lists
// every fact about the word, with its audio and the Save control.

import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import {
  Body,
  Button,
  Choice,
  ChoiceGroup,
  Column,
  cx,
  Label,
  Muted,
  Note,
  Row,
  Spinner,
  TextButton,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/colors';
import { speakWord } from '@/lib/audio';
import type { WordContent } from '@/lib/types';
import { SaveWordButton } from '@/features/feed/SaveWordButton';
import { KNOWN_AFTER_DAYS, type WordTracker } from '@/features/tracker/tracker';
import {
  knownProgress,
  knownProgressLabel,
  summaryLine,
  WORD_STATUSES,
  wordFacts,
  type WordProgress,
  type WordStatus,
  type YourWords,
} from './wordProgress';

const NOTES: Record<WordStatus, string> = {
  learning: `Words you have answered and do not know yet. A word is known once you get it right on ${KNOWN_AFTER_DAYS} separate days with no mistake since.`,
  due: 'Words your review schedule brings back now. A session reviews them.',
  known: `Right on ${KNOWN_AFTER_DAYS} separate days with no mistake since. A mistake moves a word back to Learning.`,
};

const EMPTY: Record<WordStatus, string> = {
  learning: 'No words in progress.',
  due: 'Nothing is due now.',
  known: 'No known words yet.',
};

export interface LearningViewProps {
  /** Undefined while it loads. */
  words: YourWords | undefined;
  /** A query failed, so `words` will not arrive without a retry. */
  failed: boolean;
  onRetry: () => void;
  status: WordStatus;
  onChangeStatus: (status: WordStatus) => void;
  soundEnabled: boolean;
  onToggleSave: (word: WordContent) => void;
  onStartSession: () => void;
  /** The time rows are described from. Stories pass a fixed one. */
  now?: Date;
  /** Open this word's row on first render. For stories. */
  initialOpenId?: number;
}

export function LearningView({
  words,
  failed,
  onRetry,
  status,
  onChangeStatus,
  soundEnabled,
  onToggleSave,
  onStartSession,
  now = new Date(),
  initialOpenId,
}: LearningViewProps) {
  const [openId, setOpenId] = useState<number | null>(initialOpenId ?? null);

  if (!words) {
    return failed ? (
      <View className="flex-1 w-full max-w-[640px] self-center px-6 pt-8">
        <Body>Could not load your words.</Body>
        <View className="mt-6">
          <Button title="Try again" variant="secondary" onPress={onRetry} />
        </View>
      </View>
    ) : (
      <View className="flex-1 items-center justify-center">
        <Spinner size="large" />
      </View>
    );
  }

  const started = words.learning.length + words.known.length + words.due.length > 0;
  if (!started) {
    return (
      <View className="flex-1 w-full max-w-[640px] self-center px-6 pt-8">
        <Body>No words yet.</Body>
        <Muted className="mt-2">
          Words you answer in a session, a speed round or practice show up here, with how
          each one is going.
        </Muted>
        <View className="mt-6">
          <Button
            title="Start a session"
            trailingIcon="arrow-right"
            onPress={onStartSession}
          />
        </View>
      </View>
    );
  }

  const list = words[status];

  return (
    <View className="flex-1">
      <Column className="px-6 pt-4">
        <ChoiceGroup>
          {WORD_STATUSES.map((s) => {
            const n = words[s.id].length;
            return (
              <Choice
                key={s.id}
                label={`${s.label} ${n}`}
                accessibilityLabel={`${s.label}, ${n} ${n === 1 ? 'word' : 'words'}`}
                selected={status === s.id}
                onPress={() => onChangeStatus(s.id)}
              />
            );
          })}
        </ChoiceGroup>
        <Muted className="mt-3 text-[15px] leading-[22px]">{NOTES[status]}</Muted>
        {status === 'due' && list.length > 0 ? (
          <TextButton label="Start a session" onPress={onStartSession} />
        ) : null}
      </Column>

      <FlatList
        data={list}
        keyExtractor={(w) => String(w.content.wordId)}
        contentContainerStyle={{
          width: '100%',
          maxWidth: 640,
          alignSelf: 'center',
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: 48,
        }}
        ListEmptyComponent={<Note className="mt-8 text-center">{EMPTY[status]}</Note>}
        renderItem={({ item, index }) => (
          <WordProgressRow
            word={item}
            first={index === 0}
            expanded={openId === item.content.wordId}
            onToggle={() =>
              setOpenId(openId === item.content.wordId ? null : item.content.wordId)
            }
            soundEnabled={soundEnabled}
            onToggleSave={() => onToggleSave(item.content)}
            now={now}
          />
        )}
      />
    </View>
  );
}

/**
 * The days toward known as five short bars, one per day. It repeats the text
 * beside it, so a screen reader skips it.
 */
function DayMeter({ tracker }: { tracker: WordTracker | undefined }) {
  const filled =
    tracker?.status === 'known'
      ? KNOWN_AFTER_DAYS
      : Math.min(tracker?.cleanDays ?? 0, KNOWN_AFTER_DAYS);
  return (
    <View className="flex-row gap-[3px]" aria-hidden>
      {Array.from({ length: KNOWN_AFTER_DAYS }, (_, i) => (
        <View key={i} className={cx('h-[5px] w-4', i < filled ? 'bg-ink' : 'bg-rule')} />
      ))}
    </View>
  );
}

function WordProgressRow({
  word,
  first,
  expanded,
  onToggle,
  soundEnabled,
  onToggleSave,
  now,
}: {
  word: WordProgress;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
  soundEnabled: boolean;
  onToggleSave: () => void;
  now: Date;
}) {
  const { content, tracker } = word;
  const sense = content.senses[0];
  const definition = sense?.plainLanguageDefinition ?? sense?.definition ?? '';
  const summary = summaryLine(word, now);

  // The toggle and the controls under it are siblings, never nested: React
  // Native Web renders every Pressable as a <button>, and a button inside a
  // button is invalid HTML.
  return (
    <View className={first ? 'pt-2' : 'border-t border-rule'}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${content.headword}. ${knownProgressLabel(tracker)}. ${summary}. ${expanded ? 'Collapse' : 'Expand'}`}
        accessibilityState={{ expanded }}
        className="py-4 active:bg-paper-deep web:hover:bg-paper-deep"
      >
        <Row className="items-start justify-between gap-3">
          <View className="flex-1 flex-row flex-wrap items-baseline gap-x-2">
            <Body className="font-serif-medium text-[24px] leading-[30px]">
              {content.headword}
            </Body>
            {content.partOfSpeech ? (
              <Note className="text-[15px]">{content.partOfSpeech}</Note>
            ) : null}
          </View>
          <Row className="gap-2 pt-[6px]">
            <Label>{`Tier ${content.difficultyTier}`}</Label>
            <Icon
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.graphite}
            />
          </Row>
        </Row>
        {definition ? <Body className="mt-1">{definition}</Body> : null}
        <Row className="mt-3 items-center gap-3">
          <DayMeter tracker={tracker} />
          <Note className="text-[15px] leading-[20px]">{knownProgress(tracker)}</Note>
        </Row>
        <Muted className="mt-1 text-[15px] leading-[22px]">{summary}</Muted>
      </Pressable>

      {expanded ? (
        <View className="gap-3 pb-5">
          <View className="border-t border-rule pt-2">
            {wordFacts(word, now).map((f) => (
              <Row key={f.label} className="items-baseline gap-4 py-1">
                <Label className="w-[112px]">{f.label}</Label>
                <Body className="flex-1 text-[16px] leading-[22px]">{f.value}</Body>
              </Row>
            ))}
          </View>
          <Row className="flex-wrap gap-x-6">
            <TextButton
              icon="speaker"
              label="Word"
              accessibilityLabel={`Hear ${content.headword}`}
              onPress={() => {
                if (soundEnabled) void speakWord(content);
              }}
            />
            <SaveWordButton
              headword={content.headword}
              saved={word.savedAt !== null}
              onPress={onToggleSave}
            />
          </Row>
        </View>
      ) : null}
    </View>
  );
}

// The chrome around a review session: a header showing progress against the
// daily goal, the scrolling question area, and the three states where there is
// no question to show. The question itself is passed in as children, so
// app/session.tsx keeps the queue, the refills and the SRS work.

import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, H2, Muted, ProgressBar, Row } from '@/components/ui';
import { RevealScrollProvider } from '@/features/games/RevealScroll';

/** Full-screen centred content, used by the loading and stop states. */
export function SessionCenter({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-bg">
      <View className="flex-1 w-full items-center justify-center">{children}</View>
    </SafeAreaView>
  );
}

export function SessionLoading() {
  return (
    <SessionCenter>
      <ActivityIndicator color="#6C8CFF" size="large" />
    </SessionCenter>
  );
}

/** The opening queue came back empty: nothing due, no new words waiting. */
export function SessionNothingScheduled({
  onPractice,
  onBack,
}: {
  onPractice: () => void;
  onBack: () => void;
}) {
  return (
    <SessionCenter>
      <View className="items-center px-8">
        <Text className="text-5xl">✅</Text>
        <H2 className="mt-4 text-center">Nothing scheduled right now</H2>
        <Muted className="mt-2 text-center">
          No reviews are due and there are no new words waiting. Practice draws from your whole
          collection and never runs out, so you can keep playing.
        </Muted>
        <View className="mt-6 w-full gap-3">
          <Button title="Start endless practice" onPress={onPractice} />
          <Button title="Back to home" variant="secondary" onPress={onBack} />
        </View>
      </View>
    </SessionCenter>
  );
}

/** A refill came back empty part way through: the session worked the queue dry. */
export function SessionRanDry({
  answered,
  onPractice,
  onFinish,
}: {
  answered: number;
  onPractice: () => void;
  onFinish: () => void;
}) {
  return (
    <SessionCenter>
      <View className="items-center px-8">
        <Text className="text-5xl">🎉</Text>
        <H2 className="mt-4 text-center">Everything scheduled is done</H2>
        <Muted className="mt-2 text-center">
          {`You answered ${answered} this session. Nothing else is due yet. Practice keeps going for as long as you want, and it leaves your review schedule alone.`}
        </Muted>
        <View className="mt-6 w-full gap-3">
          <Button title="Keep going in practice" onPress={onPractice} />
          <Button title="Finish and see summary" variant="secondary" onPress={onFinish} />
        </View>
      </View>
    </SessionCenter>
  );
}

export interface SessionRunnerProps {
  /** Answered in this session. The header counts up, it does not count down. */
  answered: number;
  /**
   * Progress toward the daily goal, 0..1. The queue has no fixed end, so the
   * bar tracks the goal rather than the queue.
   */
  goalFraction: number;
  /** A review is being committed: the screen dims and waits. */
  submitting: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function SessionRunner({
  answered,
  goalFraction,
  submitting,
  onClose,
  children,
}: SessionRunnerProps) {
  const scrollRef = useRef<ScrollView>(null);

  // Each answer brings in a new question. The reveal may have scrolled the
  // previous one to its end, so start the next one from the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [answered]);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <View className="px-5 pt-2">
        <Row className="items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close session"
            onPress={onClose}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface2"
          >
            <Text className="text-text text-lg">✕</Text>
          </Pressable>
          <View className="flex-1">
            <ProgressBar fraction={goalFraction} />
          </View>
          <Muted>{`${answered} done`}</Muted>
        </Row>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 32,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <RevealScrollProvider scrollRef={scrollRef}>{children}</RevealScrollProvider>
      </ScrollView>

      {submitting ? (
        <View className="absolute inset-0 items-center justify-center bg-bg/40">
          <ActivityIndicator color="#6C8CFF" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// The chrome around a review session: a header showing progress against the
// daily goal, the scrolling question area, and the three states where there is
// no question to show. The question itself is passed in as children, so
// app/session.tsx keeps the queue, the refills and the SRS work.

import { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import {
  Body,
  Button,
  CenterScreen,
  Column,
  EmptyState,
  FullScreen,
  ProgressBar,
  RunnerHeader,
  Spinner,
} from '@/components/ui';
import { RevealScrollProvider } from '@/features/games/RevealScroll';

export function SessionLoading() {
  return (
    <CenterScreen>
      <Spinner size="large" />
    </CenterScreen>
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
    <EmptyState
      label="Session"
      title="Nothing scheduled right now"
      actions={
        <>
          <Button
            title="Start endless practice"
            trailingIcon="arrow-right"
            onPress={onPractice}
          />
          <Button title="Back to home" variant="secondary" onPress={onBack} />
        </>
      }
    >
      <Body className="text-graphite">
        No reviews are due and there are no new words waiting. Practice draws from your
        whole collection and never runs out, so you can keep playing.
      </Body>
    </EmptyState>
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
    <EmptyState
      label="Session"
      title="Everything scheduled is done"
      actions={
        <>
          <Button
            title="Keep going in practice"
            trailingIcon="arrow-right"
            onPress={onPractice}
          />
          <Button title="Finish and see summary" variant="secondary" onPress={onFinish} />
        </>
      }
    >
      <Body className="text-graphite">
        {`You answered ${answered} this session. Nothing else is due yet. Practice keeps going for as long as you want, and it leaves your review schedule alone.`}
      </Body>
    </EmptyState>
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
    <FullScreen>
      <RunnerHeader
        closeLabel="Close session"
        onClose={onClose}
        status={`${answered} done`}
      >
        <ProgressBar fraction={goalFraction} />
      </RunnerHeader>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 28,
          paddingBottom: 40,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Column className="flex-1">
          <RevealScrollProvider scrollRef={scrollRef}>{children}</RevealScrollProvider>
        </Column>
      </ScrollView>

      {submitting ? (
        <View className="absolute inset-0 items-center justify-center bg-paper/60">
          <Spinner />
        </View>
      ) : null}
    </FullScreen>
  );
}

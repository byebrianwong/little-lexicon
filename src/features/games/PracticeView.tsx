// Chrome for endless practice: a header with the running score and the game
// itself as children. app/practice.tsx keeps the queue and the scoring.

import { useEffect, useRef } from 'react';
import { ScrollView } from 'react-native';
import {
  Body,
  Button,
  CenterScreen,
  Column,
  EmptyState,
  FullScreen,
  Label,
  RunnerHeader,
  Spinner,
} from '@/components/ui';
import { RevealScrollProvider } from './RevealScroll';

export function PracticeLoading() {
  return (
    <CenterScreen>
      <Spinner size="large" />
    </CenterScreen>
  );
}

/** The collection has no words, so there is nothing to practise. */
export function PracticeEmpty({ onBack }: { onBack: () => void }) {
  return (
    <EmptyState
      label="Practice"
      title="No words yet"
      actions={<Button title="Back" onPress={onBack} />}
    >
      <Body className="text-graphite">
        Practice draws from your whole collection. Once the collection has words, this
        never runs out.
      </Body>
    </EmptyState>
  );
}

export interface PracticeRunnerProps {
  answered: number;
  correct: number;
  onClose: () => void;
  children: React.ReactNode;
}

export function PracticeRunner({
  answered,
  correct,
  onClose,
  children,
}: PracticeRunnerProps) {
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const scrollRef = useRef<ScrollView>(null);

  // Each answer brings in a new question. The reveal may have scrolled the
  // previous one to its end, so start the next one from the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [answered]);

  return (
    <FullScreen>
      <RunnerHeader
        closeLabel="Close practice"
        onClose={onClose}
        status={answered > 0 ? `${accuracy}%` : '—'}
      >
        <Label>{`Practice · ${answered} answered`}</Label>
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
    </FullScreen>
  );
}

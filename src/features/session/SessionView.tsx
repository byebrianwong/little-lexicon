// The chrome around a review session: progress header, scrolling question
// area, and the two states where there is no question to show. The question
// itself is passed in as children, so app/session.tsx keeps the SRS work.

import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, H2, Muted, ProgressBar, Row } from '@/components/ui';

/** Full-screen centered content, used by the loading and empty states. */
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

/** Nothing is due and the day's new words are done. */
export function SessionCaughtUp({ onBack }: { onBack: () => void }) {
  return (
    <SessionCenter>
      <View className="items-center px-8">
        <Text className="text-5xl">✅</Text>
        <H2 className="mt-4 text-center">You are all caught up</H2>
        <Muted className="mt-2 text-center">
          No reviews are due and today&apos;s new words are done. Come back later or raise your
          daily goal in settings.
        </Muted>
        <View className="mt-6 w-full">
          <Button title="Back to home" onPress={onBack} />
        </View>
      </View>
    </SessionCenter>
  );
}

export interface SessionRunnerProps {
  /** Zero-based position in the queue. */
  index: number;
  total: number;
  /** A review is being committed: the screen dims and waits. */
  submitting: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function SessionRunner({
  index,
  total,
  submitting,
  onClose,
  children,
}: SessionRunnerProps) {
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
            <ProgressBar fraction={total > 0 ? index / total : 0} />
          </View>
          <Muted>{`${index + 1}/${total}`}</Muted>
        </Row>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 32,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>

      {submitting ? (
        <View className="absolute inset-0 items-center justify-center bg-bg/40">
          <ActivityIndicator color="#6C8CFF" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

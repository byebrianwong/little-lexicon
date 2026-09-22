// Chrome for endless practice: a header with the running score and the game
// itself as children. app/practice.tsx keeps the queue and the scoring.

import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, H2, Muted, Row } from '@/components/ui';

function Center({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-bg">
      <View className="flex-1 w-full items-center justify-center">{children}</View>
    </SafeAreaView>
  );
}

export function PracticeLoading() {
  return (
    <Center>
      <ActivityIndicator color="#6C8CFF" size="large" />
    </Center>
  );
}

/** The collection has no words, so there is nothing to practise. */
export function PracticeEmpty({ onBack }: { onBack: () => void }) {
  return (
    <Center>
      <View className="items-center px-8">
        <Text className="text-5xl">📚</Text>
        <H2 className="mt-4 text-center">No words yet</H2>
        <Muted className="mt-2 text-center">
          Practice draws from your whole collection. Once the collection has words, this never
          runs out.
        </Muted>
        <View className="mt-6 w-full">
          <Button title="Back" onPress={onBack} />
        </View>
      </View>
    </Center>
  );
}

export interface PracticeRunnerProps {
  answered: number;
  correct: number;
  onClose: () => void;
  children: React.ReactNode;
}

export function PracticeRunner({ answered, correct, onClose, children }: PracticeRunnerProps) {
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <View className="px-5 pt-2">
        <Row className="items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close practice"
            onPress={onClose}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface2"
          >
            <Text className="text-text text-lg">✕</Text>
          </Pressable>
          <View className="flex-1">
            <Muted>{`Practice · ${answered} answered`}</Muted>
          </View>
          <Muted>{answered > 0 ? `${accuracy}%` : '—'}</Muted>
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
    </SafeAreaView>
  );
}

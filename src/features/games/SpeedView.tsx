// The speed round's layout: countdown, one word, four meanings. app/speed.tsx
// keeps the timer, the queue and the scoring.

import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, H1, H2, Muted, ProgressBar, Row } from '@/components/ui';
import { FAST_THRESHOLD_MS } from '@/srs/srs';
import type { Option } from './optionPool';
import { OptionButton } from './modes/OptionButton';

export const ROUND_SECONDS = 60;

function Center({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-bg">{children}</SafeAreaView>
  );
}

export function SpeedLoading() {
  return (
    <Center>
      <ActivityIndicator color="#6C8CFF" size="large" />
    </Center>
  );
}

/** No words learned yet, so there is nothing to race. */
export function SpeedEmpty({ onBack }: { onBack: () => void }) {
  return (
    <Center>
      <View className="items-center px-8">
        <Text className="text-5xl">⚡️</Text>
        <H2 className="mt-4 text-center">Nothing to race yet</H2>
        <Muted className="mt-2 text-center">
          Learn a few words first, then come back for a speed round.
        </Muted>
        <View className="mt-6 w-full">
          <Button title="Back" onPress={onBack} />
        </View>
      </View>
    </Center>
  );
}

export interface SpeedRoundViewProps {
  headword: string;
  options: Option[];
  /** The option just tapped, or null while the question is open. */
  chosen: Option | null;
  /** Seconds left in the round. Clamped at zero for display. */
  remaining: number;
  answeredCount: number;
  onChoose: (option: Option) => void;
  onClose: () => void;
}

export function SpeedRoundView({
  headword,
  options,
  chosen,
  remaining,
  answeredCount,
  onChoose,
  onClose,
}: SpeedRoundViewProps) {
  const left = Math.max(0, remaining);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <View className="px-5 pt-2">
        <Row className="items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close speed round"
            onPress={onClose}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface2"
          >
            <Text className="text-text text-lg">✕</Text>
          </Pressable>
          <View className="flex-1">
            <ProgressBar fraction={left / ROUND_SECONDS} />
          </View>
          <Muted>{`${left}s`}</Muted>
        </Row>
      </View>

      <View className="flex-1 px-5 pt-8">
        <Row className="justify-between">
          <H1>{headword}</H1>
          <Muted>{`⚡️ ${answeredCount}`}</Muted>
        </Row>
        <Body className="mt-2 text-muted">Pick the meaning, fast.</Body>

        <View className="mt-6">
          {options.map((opt) => {
            const state = !chosen
              ? 'idle'
              : opt.correct
                ? 'correct'
                : opt === chosen
                  ? 'wrong'
                  : 'muted';
            return (
              <OptionButton
                key={opt.text}
                label={opt.text}
                state={state}
                disabled={!!chosen}
                onPress={() => onChoose(opt)}
              />
            );
          })}
        </View>
        <Muted className="mt-2">
          {`Fast answers under ${Math.round(FAST_THRESHOLD_MS / 1000)}s earn bonus XP.`}
        </Muted>
      </View>
    </SafeAreaView>
  );
}

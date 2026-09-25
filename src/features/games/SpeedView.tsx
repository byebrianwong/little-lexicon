// The speed round's layout: countdown, one word, four meanings. app/speed.tsx
// keeps the timer, the queue and the scoring.

import { View } from 'react-native';
import {
  Body,
  Button,
  CenterScreen,
  Column,
  EmptyState,
  FullScreen,
  Headword,
  Label,
  Note,
  ProgressBar,
  RunnerHeader,
  Row,
  Spinner,
} from '@/components/ui';
import { FAST_THRESHOLD_MS } from '@/srs/srs';
import type { Option } from './optionPool';
import { OptionButton, OptionList } from './modes/OptionButton';

export const ROUND_SECONDS = 60;

export function SpeedLoading() {
  return (
    <CenterScreen>
      <Spinner size="large" />
    </CenterScreen>
  );
}

/** No words learned yet, so there is nothing to race. */
export function SpeedEmpty({ onBack }: { onBack: () => void }) {
  return (
    <EmptyState
      label="Speed round"
      title="Nothing to race yet"
      actions={<Button title="Back" onPress={onBack} />}
    >
      <Body className="text-graphite">
        Learn a few words first, then come back for a speed round.
      </Body>
    </EmptyState>
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
    <FullScreen>
      {/* Time left drains in red: the one place the accent means urgency. */}
      <RunnerHeader closeLabel="Close speed round" onClose={onClose} status={`${left}s`}>
        <ProgressBar fraction={left / ROUND_SECONDS} tone="accent" />
      </RunnerHeader>

      <Column className="flex-1 px-6 pt-8">
        <Row className="items-baseline justify-between">
          <Label>Pick the meaning, fast</Label>
          <Label tone="ink">{`${answeredCount} answered`}</Label>
        </Row>
        <Headword className="mt-2">{headword}</Headword>

        <View className="mt-5">
          <OptionList>
            {options.map((opt, i) => {
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
                  index={i}
                  label={opt.text}
                  state={state}
                  disabled={!!chosen}
                  onPress={() => onChoose(opt)}
                />
              );
            })}
          </OptionList>
        </View>
        <Note className="mt-4">
          {`Answers under ${Math.round(FAST_THRESHOLD_MS / 1000)} seconds earn bonus XP.`}
        </Note>
      </Column>
    </FullScreen>
  );
}

// The end-of-session screen. app/summary.tsx reads the summary from the store
// and handles navigation; this renders it.

import { View } from 'react-native';
import {
  Body,
  Button,
  H1,
  Label,
  Muted,
  Note,
  Row,
  Screen,
  Section,
  Stat,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { achievementByCode } from '@/features/gamification/achievements';
import { colors } from '@/theme/colors';
import type { SessionSummary } from './sessionResult';

export interface SummaryViewProps {
  summary: SessionSummary;
  onDone: () => void;
  onAnother: () => void;
}

export function SummaryView({ summary, onDone, onAnother }: SummaryViewProps) {
  const accuracyPct = Math.round(summary.accuracy * 100);

  return (
    <Screen scroll insets="window">
      <View className="pt-8">
        <Label tone={summary.goalMet ? 'accent' : 'graphite'}>
          {summary.goalMet ? 'Daily goal met' : 'Session'}
        </Label>
        <H1 className="mt-2 text-[40px] leading-[46px]">
          {summary.goalMet ? 'Well done.' : 'Session complete'}
        </H1>
        <Note className="mt-2 text-[17px]">
          {summary.goalMet
            ? `Streak is now ${summary.streakCount} day${summary.streakCount === 1 ? '' : 's'}.`
            : 'Every review counts. Keep going whenever you have the time.'}
        </Note>
      </View>

      <Section className="mt-8">
        <Row className="items-start gap-4 pt-1">
          <Stat value={summary.reviewed} label="Reviewed" />
          <Stat value={`${accuracyPct}%`} label="Accuracy" />
          <Stat value={`+${summary.xpEarned}`} label="XP" />
        </Row>
      </Section>

      {summary.newWords > 0 ? (
        <Body className="mt-6">
          {`You learned ${summary.newWords} new word${summary.newWords === 1 ? '' : 's'} in that session.`}
        </Body>
      ) : null}

      {summary.newAchievements.length > 0 ? (
        <Section label="Achievements unlocked" className="mt-8">
          <View className="border-b border-rule">
            {summary.newAchievements.map((code) => {
              const a = achievementByCode(code);
              return (
                <Row key={code} className="items-start gap-3 border-t border-rule py-3">
                  <View className="pt-[3px]">
                    <Icon name="check" color={colors.accent} strokeWidth={2.25} />
                  </View>
                  <View className="flex-1">
                    <Body className="font-serif-medium">{a?.title ?? code}</Body>
                    {a?.description ? <Muted>{a.description}</Muted> : null}
                  </View>
                </Row>
              );
            })}
          </View>
        </Section>
      ) : null}

      <View className="mt-10 gap-3">
        <Button title="Done" onPress={onDone} />
        <Button title="Keep going" variant="secondary" onPress={onAnother} />
      </View>
    </Screen>
  );
}

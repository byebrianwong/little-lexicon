// The weekly leaderboard and the achievement list, with no data fetching.
// app/(app)/leaderboard.tsx supplies both lists.

import { Text, View } from 'react-native';
import { Body, H1, Label, Muted, Note, Row, Screen, Section, cx } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/colors';
import type { LeaderboardEntry } from '@/lib/backend/types';
import { ACHIEVEMENTS, achievementByCode } from './achievements';

export interface LeaderboardViewProps {
  /** Undefined while loading; an empty array means nobody has scored yet. */
  entries: LeaderboardEntry[] | undefined;
  unlockedCodes: string[] | undefined;
  onRefresh: () => void;
}

export function LeaderboardView({
  entries,
  unlockedCodes,
  onRefresh,
}: LeaderboardViewProps) {
  const unlocked = new Set(unlockedCodes ?? []);

  return (
    <Screen scroll edges={['top']} onRefresh={onRefresh}>
      <H1 className="pt-4">This week</H1>
      <Note className="mt-2">
        You are grouped with a small cohort. Ranks reset at the start of each week.
      </Note>

      <Section label="Ranking" trailing="XP" className="mt-8">
        <View className="border-b border-rule">
          {(entries ?? []).map((row) => (
            <Row
              key={row.userId}
              className={cx(
                'min-h-[50px] justify-between gap-3 border-t border-rule',
                row.isCurrentUser && 'bg-paper-deep',
              )}
            >
              <Row className="flex-1 gap-3">
                <Text className="w-8 pl-1 font-serif-italic text-[16px] leading-[22px] text-graphite">
                  {row.rankInCohort}
                </Text>
                <Body
                  className={cx('flex-shrink', row.isCurrentUser && 'font-serif-medium')}
                >
                  {row.displayName ?? 'Learner'}
                </Body>
                {row.isCurrentUser ? <Label tone="accent">You</Label> : null}
              </Row>
              <Body className="pr-1 font-serif-medium">{row.weeklyXp}</Body>
            </Row>
          ))}
          {entries && entries.length === 0 ? (
            <Note className="py-4">No scores yet this week. Be the first.</Note>
          ) : null}
        </View>
      </Section>

      <Section
        label="Achievements"
        trailing={`${unlocked.size} of ${ACHIEVEMENTS.length}`}
        className="mt-10"
      >
        <View className="border-b border-rule">
          {ACHIEVEMENTS.map((a) => {
            const has = unlocked.has(a.code);
            const meta = achievementByCode(a.code)!;
            return (
              <Row key={a.code} className="items-start gap-3 border-t border-rule py-3">
                <View className="w-5 pt-[3px]">
                  {has ? (
                    <Icon name="check" color={colors.accent} strokeWidth={2.25} />
                  ) : (
                    <View className="mt-[2px] h-4 w-4 rounded-full border border-line" />
                  )}
                </View>
                <View className="flex-1">
                  <Body className={has ? 'font-serif-medium' : 'text-graphite'}>
                    {meta.title}
                  </Body>
                  <Muted>{meta.description}</Muted>
                </View>
                {/* Said in words too, so the state does not rest on the mark. */}
                {!has ? <Label className="pt-[5px]">Locked</Label> : null}
              </Row>
            );
          })}
        </View>
      </Section>
    </Screen>
  );
}

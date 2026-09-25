// The progress screen's layout, with no data fetching. app/(app)/stats.tsx
// supplies the numbers.

import { View } from 'react-native';
import {
  Body,
  H1,
  Muted,
  Note,
  ProgressBar,
  Row,
  Screen,
  Section,
  Stat,
} from '@/components/ui';
import { levelProgress } from '@/features/gamification/xp';
import type { ForecastDay, ProgressCounts } from '@/lib/backend/types';
import type { DailyStats, Profile } from '@/lib/types';
import { Heatmap } from './Heatmap';

export interface StatsViewProps {
  profile: Profile | undefined;
  counts: ProgressCounts | undefined;
  /** Share of reviews recalled correctly, 0..1. Undefined until it loads. */
  retention: number | undefined;
  daily: DailyStats[] | undefined;
  forecast: ForecastDay[] | undefined;
  onRefresh: () => void;
}

export function StatsView({
  profile,
  counts,
  retention,
  daily,
  forecast,
  onRefresh,
}: StatsViewProps) {
  const lvl = profile ? levelProgress(profile.xpTotal) : null;
  const retentionPct = retention !== undefined ? Math.round(retention * 100) : null;
  const maxForecast = Math.max(1, ...(forecast ?? []).map((f) => f.dueCount));
  const streak = profile?.streakCount ?? 0;

  return (
    <Screen scroll edges={['top']} onRefresh={onRefresh}>
      <H1 className="pt-4">Progress</H1>

      <Section label="Words" className="mt-8">
        <Row className="items-start gap-4">
          <Stat value={counts?.known ?? 0} label="Known" />
          <Stat value={counts?.learning ?? 0} label="Learning" />
          <Stat value={counts?.due ?? 0} label="Due" />
        </Row>
        <Row className="mt-6 items-start gap-4">
          <Stat value={counts?.reviewCount ?? 0} label="In review" />
          <Stat
            value={retentionPct === null ? '—' : `${retentionPct}%`}
            label="Retention"
          />
          <Stat value={streak} label="Day streak" />
        </Row>
      </Section>

      {lvl ? (
        <Section
          label={`Level ${lvl.level}`}
          trailing={`${lvl.xpIntoLevel} / ${lvl.xpForNextLevel} XP`}
          className="mt-10"
        >
          <View className="pt-1">
            <ProgressBar fraction={lvl.fraction} />
          </View>
        </Section>
      ) : null}

      <Section label="Activity" trailing="Last 12 weeks" className="mt-10">
        {daily ? <Heatmap days={daily} /> : <Muted>Loading…</Muted>}
      </Section>

      <Section label="Upcoming reviews" trailing="Next 14 days" className="mt-10">
        <View className="gap-[6px]">
          {(forecast ?? []).map((f) => (
            <Row key={f.day} className="gap-3">
              <Muted className="w-14 text-[15px] leading-[20px]">{f.day.slice(5)}</Muted>
              <View className="h-[5px] flex-1 bg-rule">
                <View
                  className="h-[5px] bg-ink"
                  style={{ width: `${Math.round((f.dueCount / maxForecast) * 100)}%` }}
                />
              </View>
              <Body className="w-8 text-right text-[16px] leading-[20px]">
                {f.dueCount}
              </Body>
            </Row>
          ))}
        </View>
      </Section>

      {retentionPct !== null ? (
        <Note className="mt-8 text-[15px]">
          Retention is the share of your reviews in the last 30 days you recalled
          correctly.
        </Note>
      ) : null}
    </Screen>
  );
}

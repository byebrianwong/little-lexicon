// The progress screen's layout, with no data fetching. app/(app)/stats.tsx
// supplies the numbers.

import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Card, H1, H2, Muted, ProgressBar, Row } from '@/components/ui';
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

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#6C8CFF" />
        }
      >
        <H1>Progress</H1>

        <Row className="mt-5 gap-3">
          <Tile label="Known" value={counts?.known ?? 0} />
          <Tile label="Learning" value={counts?.learning ?? 0} />
          <Tile label="Due" value={counts?.due ?? 0} />
        </Row>

        <Row className="mt-3 gap-3">
          <Tile label="In review" value={counts?.reviewCount ?? 0} />
          <Tile label="Retention" value={retentionPct === null ? '—' : `${retentionPct}%`} />
          <Tile label="Streak" value={`🔥 ${profile?.streakCount ?? 0}`} />
        </Row>

        {lvl ? (
          <Card className="mt-5">
            <Row className="justify-between">
              <H2>{`Level ${lvl.level}`}</H2>
              <Muted>{`${lvl.xpIntoLevel} / ${lvl.xpForNextLevel} XP`}</Muted>
            </Row>
            <View className="mt-3">
              <ProgressBar fraction={lvl.fraction} />
            </View>
          </Card>
        ) : null}

        <Card className="mt-5">
          <H2>Activity</H2>
          <Muted className="mt-1">Last 12 weeks</Muted>
          <View className="mt-3">
            {daily ? <Heatmap days={daily} /> : <Muted>Loading…</Muted>}
          </View>
        </Card>

        <Card className="mt-5">
          <H2>Upcoming reviews</H2>
          <Muted className="mt-1">Next 14 days</Muted>
          <View className="mt-3 gap-2">
            {(forecast ?? []).map((f) => (
              <Row key={f.day} className="items-center gap-3">
                <Muted className="w-16">{f.day.slice(5)}</Muted>
                <View className="h-4 flex-1 rounded-full bg-surface2 overflow-hidden">
                  <View
                    className="h-4 rounded-full bg-primary"
                    style={{ width: `${Math.round((f.dueCount / maxForecast) * 100)}%` }}
                  />
                </View>
                <Body className="w-8 text-right">{f.dueCount}</Body>
              </Row>
            ))}
          </View>
        </Card>

        {retentionPct !== null ? (
          <Muted className="mt-4">
            Retention is the share of your reviews in the last 30 days you recalled correctly.
          </Muted>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="flex-1 items-center">
      <H2>{value}</H2>
      <Muted className="mt-1">{label}</Muted>
    </Card>
  );
}

// Calendar heatmap of daily activity (Phase 5.4). Columns are weeks; each cell
// is a day, shaded by reviews done. No external chart library.

import { View } from 'react-native';
import type { DailyStats } from '@/lib/types';
import { Muted } from '@/components/ui';

function shade(reviews: number): string {
  if (reviews <= 0) return '#1E2740';
  if (reviews < 5) return '#2C3E6B';
  if (reviews < 10) return '#3E5DB0';
  if (reviews < 20) return '#5A7CF0';
  return '#8AA6FF';
}

export function Heatmap({ days }: { days: DailyStats[] }) {
  // Group into weeks of 7, oldest first.
  const weeks: DailyStats[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <View>
      <View className="flex-row gap-1">
        {weeks.map((week, wi) => (
          <View key={wi} className="gap-1">
            {week.map((d) => (
              <View
                key={d.day}
                accessibilityLabel={`${d.day}: ${d.reviewsDone} reviews`}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: shade(d.reviewsDone),
                }}
              />
            ))}
          </View>
        ))}
      </View>
      <View className="mt-2 flex-row items-center gap-2">
        <Muted>Less</Muted>
        {[0, 4, 9, 19, 25].map((n) => (
          <View
            key={n}
            style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: shade(n) }}
          />
        ))}
        <Muted>More</Muted>
      </View>
    </View>
  );
}

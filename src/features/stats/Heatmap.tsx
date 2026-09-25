// Calendar heatmap of daily activity (Phase 5.4). Columns are weeks; each cell
// is a day, shaded by reviews done. No external chart library.
//
// Shades run from a faint paper tone to full ink, so busier days are darker
// in greyscale as well as in colour.

import { View } from 'react-native';
import type { DailyStats } from '@/lib/types';
import { Muted } from '@/components/ui';
import { heat } from '@/theme/colors';

function shade(reviews: number): string {
  if (reviews <= 0) return heat[0];
  if (reviews < 5) return heat[1];
  if (reviews < 10) return heat[2];
  if (reviews < 20) return heat[3];
  return heat[4];
}

const CELL = 13;
const GAP = 3;

export function Heatmap({ days }: { days: DailyStats[] }) {
  // Group into weeks of 7, oldest first.
  const weeks: DailyStats[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <View>
      <View className="flex-row" style={{ gap: GAP }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ gap: GAP }}>
            {week.map((d) => (
              <View
                key={d.day}
                // The label needs a role to go with it. React Native Web renders
                // a plain View as a <div> and turns accessibilityLabel into
                // aria-label, which ARIA prohibits on an element with no role,
                // so every cell reported aria-prohibited-attr. "image" is the
                // honest description: each cell conveys one day's activity.
                accessibilityRole="image"
                accessibilityLabel={`${d.day}: ${d.reviewsDone} reviews`}
                style={{
                  width: CELL,
                  height: CELL,
                  borderRadius: 2,
                  backgroundColor: shade(d.reviewsDone),
                }}
              />
            ))}
          </View>
        ))}
      </View>
      <View className="mt-3 flex-row items-center gap-2">
        <Muted className="text-[14px] leading-[18px]">Less</Muted>
        {[0, 4, 9, 19, 25].map((n) => (
          <View
            key={n}
            style={{
              width: CELL,
              height: CELL,
              borderRadius: 2,
              backgroundColor: shade(n),
            }}
          />
        ))}
        <Muted className="text-[14px] leading-[18px]">More</Muted>
      </View>
    </View>
  );
}

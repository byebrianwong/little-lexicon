import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import type { DailyStats } from '@/lib/types';
import { Heatmap } from './Heatmap';

// Fixed data, not generated from today's date or a random seed. Chromatic
// compares images, so a story that changes on its own reports a diff every run.
const START = Date.UTC(2026, 0, 5); // Monday, 5 January 2026
const DAY_MS = 24 * 60 * 60 * 1000;

// Cycled review counts that land in every shade bucket the component defines
// (0, under 5, under 10, under 20, 20 and over), including rest days.
const PATTERN = [12, 8, 0, 25, 3, 17, 0, 6, 21, 0, 9, 14, 2, 30];

function days(count: number, pattern: number[] = PATTERN): DailyStats[] {
  return Array.from({ length: count }, (_, i) => {
    const reviewsDone = pattern[i % pattern.length] ?? 0;
    return {
      day: new Date(START + i * DAY_MS).toISOString().slice(0, 10),
      reviewsDone,
      newLearned: reviewsDone > 0 ? (i % 4) : 0,
      xp: reviewsDone * 10,
      goalMet: reviewsDone >= 10,
    };
  });
}

const meta = {
  title: 'Stats/Heatmap',
  component: Heatmap,
  decorators: [
    (Story) => (
      <View style={{ width: 340 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Heatmap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwelveWeeks: Story = {
  args: { days: days(84) },
};

export const FourWeeks: Story = {
  args: { days: days(28) },
};

// A new account: the grid should still render, all cells at the empty shade.
export const NoActivity: Story = {
  args: { days: days(28, [0]) },
};

// A partial final week exercises the grouping loop's last, short column.
export const PartialWeek: Story = {
  args: { days: days(31) },
};

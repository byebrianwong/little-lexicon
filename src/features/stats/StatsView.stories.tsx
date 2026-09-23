import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { phone } from '@/stories/decorators';
import {
  counts,
  dailyStats,
  EMPTY_COUNTS,
  forecast,
  NEW_PROFILE,
  profile,
} from '@/stories/fixtures';
import { StatsView } from './StatsView';

const meta = {
  title: 'Screens/Stats',
  component: StatsView,
  args: {
    profile: profile(),
    counts: counts(),
    retention: 0.87,
    daily: dailyStats(84),
    forecast: forecast(14),
    onRefresh: () => {},
  },
  decorators: [phone],
} satisfies Meta<typeof StatsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An account with months of history. */
export const Populated: Story = {};

/**
 * A new account. Every tile reads zero, retention has no reviews to measure so
 * it shows a dash, and the heatmap is all empty cells.
 */
export const NewAccount: Story = {
  args: {
    profile: NEW_PROFILE,
    counts: EMPTY_COUNTS,
    retention: undefined,
    daily: dailyStats(84, [0]),
    forecast: [],
  },
};

/** Every query still in flight: tiles fall back to zero, the heatmap says so. */
export const Loading: Story = {
  args: {
    profile: undefined,
    counts: undefined,
    retention: undefined,
    daily: undefined,
    forecast: undefined,
  },
};

/** Perfect recall so far, and a forecast with one very heavy day. */
export const HighRetention: Story = {
  args: { retention: 1, forecast: forecast(14).map((f, i) => ({ ...f, dueCount: i === 3 ? 90 : f.dueCount })) },
};

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { phone } from '@/stories/decorators';
import { LEADERBOARD, UNLOCKED_ACHIEVEMENTS } from '@/stories/fixtures';
import { ACHIEVEMENTS } from './achievements';
import { LeaderboardView } from './LeaderboardView';

const meta = {
  title: 'Screens/Leaderboard',
  component: LeaderboardView,
  args: {
    entries: LEADERBOARD,
    unlockedCodes: UNLOCKED_ACHIEVEMENTS,
    onRefresh: () => {},
  },
  decorators: [phone],
} satisfies Meta<typeof LeaderboardView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mid-cohort: the current user's row is highlighted and marked "(you)". */
export const MidTable: Story = {};

/** Top of the cohort. */
export const InFirstPlace: Story = {
  args: {
    entries: LEADERBOARD.map((row, i) => ({
      ...row,
      rankInCohort: i + 1,
      isCurrentUser: i === 0,
    })),
  },
};

/** Start of a week, before anyone has earned XP. */
export const NoScoresYet: Story = {
  args: { entries: [], unlockedCodes: [] },
};

/** Nothing unlocked: every achievement is dimmed with a hollow star. */
export const NoAchievements: Story = {
  args: { unlockedCodes: [] },
};

/** Everything unlocked. */
export const AllAchievements: Story = {
  args: { unlockedCodes: ACHIEVEMENTS.map((a) => a.code) },
};

/** Both queries still in flight. */
export const Loading: Story = {
  args: { entries: undefined, unlockedCodes: undefined },
};

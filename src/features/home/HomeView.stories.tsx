import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { phone } from '@/stories/decorators';
import { counts, EMPTY_COUNTS, NEW_PROFILE, VETERAN_PROFILE, profile } from '@/stories/fixtures';
import { HomeView } from './HomeView';

const meta = {
  title: 'Screens/Home',
  component: HomeView,
  args: {
    profile: profile(),
    reviewsToday: 9,
    counts: counts(),
    onRefresh: () => {},
    onStartSession: () => {},
    onPractice: () => {},
    onSpeedRound: () => {},
    onChooseLevel: () => {},
  },
  decorators: [phone],
} satisfies Meta<typeof HomeView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A returning learner part way through the day's goal. The common case. */
export const PartWayThroughGoal: Story = {};

/** The goal is met: the progress bar is full and the copy changes. */
export const GoalMet: Story = {
  args: { reviewsToday: 15 },
};

/** Nothing reviewed yet today. */
export const NothingDoneToday: Story = {
  args: { reviewsToday: 0 },
};

/**
 * A brand new account: no name, no streak, no words, no level card. It has no
 * word level saved, so the menu offers the level picker.
 */
export const NewAccount: Story = {
  args: { profile: NEW_PROFILE, reviewsToday: 0, counts: EMPTY_COUNTS },
};

/**
 * A returning learner who skipped the old placement test, so no word level is
 * saved. The menu offers the level picker until one is chosen.
 */
export const NoLevelChosen: Story = {
  args: { profile: profile({ levelEstimate: null }) },
};

/** Queries still in flight. Every value falls back rather than blanking out. */
export const Loading: Story = {
  args: { profile: undefined, counts: undefined, reviewsToday: 0 },
};

/** A long-running account: five figures of XP and a three-digit streak. */
export const LongRunningAccount: Story = {
  args: {
    profile: VETERAN_PROFILE,
    reviewsToday: 22,
    counts: counts({ known: 1240, learning: 68, due: 152, knownTotal: 1240, total: 1500 }),
  },
};

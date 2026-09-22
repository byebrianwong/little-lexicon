import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { phone } from '@/stories/decorators';
import { SummaryView } from './SummaryView';

const meta = {
  title: 'Screens/Summary',
  component: SummaryView,
  args: {
    summary: {
      reviewed: 15,
      correct: 13,
      xpEarned: 210,
      newWords: 3,
      accuracy: 13 / 15,
      goalMet: true,
      streakCount: 8,
      newAchievements: [],
    },
    onDone: () => {},
    onAnother: () => {},
  },
  decorators: [phone],
} satisfies Meta<typeof SummaryView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The goal was met, so the streak line leads. */
export const GoalMet: Story = {};

/** A short session that did not reach the goal. */
export const GoalNotMet: Story = {
  args: {
    summary: {
      reviewed: 4,
      correct: 3,
      xpEarned: 45,
      newWords: 0,
      accuracy: 0.75,
      goalMet: false,
      streakCount: 7,
      newAchievements: [],
    },
  },
};

/** Achievements unlocked in this session get their own gold card. */
export const WithAchievements: Story = {
  args: {
    summary: {
      reviewed: 12,
      correct: 12,
      xpEarned: 240,
      newWords: 1,
      accuracy: 1,
      goalMet: true,
      streakCount: 7,
      newAchievements: ['perfect_session', 'streak_7'],
    },
  },
};

/** First day of a streak: "1 day", not "1 days". */
export const FirstDayOfStreak: Story = {
  args: {
    summary: {
      reviewed: 15,
      correct: 10,
      xpEarned: 150,
      newWords: 1,
      accuracy: 10 / 15,
      goalMet: true,
      streakCount: 1,
      newAchievements: ['first_session'],
    },
  },
};

/** Every answer wrong. Accuracy reads 0% rather than an empty tile. */
export const EverythingWrong: Story = {
  args: {
    summary: {
      reviewed: 6,
      correct: 0,
      xpEarned: 12,
      newWords: 0,
      accuracy: 0,
      goalMet: false,
      streakCount: 0,
      newAchievements: [],
    },
  },
};

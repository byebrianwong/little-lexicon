import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { GameProvider } from '@/features/games/GameContext';
import { GameHost } from '@/features/games/GameHost';
import { WordIntro } from '@/features/games/WordIntro';
import { POOL, profile, SESSION_ITEMS } from '@/stories/fixtures';
import { phone } from '@/stories/decorators';
import {
  SessionLoading,
  SessionNothingScheduled,
  SessionRanDry,
  SessionRunner,
} from './SessionView';

// The runner is the frame around a question: goal progress, a count of what has
// been answered, a close button and the submitting overlay. These stories put a
// real game mode inside it, so the snapshot is what a session actually looks
// like.
const meta = {
  title: 'Screens/Session',
  component: SessionRunner,
  args: {
    answered: 6,
    goalFraction: 6 / 15,
    submitting: false,
    onClose: () => {},
  },
  decorators: [phone],
} satisfies Meta<typeof SessionRunner>;

export default meta;
type Story = StoryObj<typeof meta>;

function question(itemIndex: number) {
  const item = SESSION_ITEMS[itemIndex]!;
  return (
    <GameProvider value={{ pool: POOL, profile: profile() }}>
      <GameHost item={item} mode="mc_word_to_def" onOutcome={() => {}} soundEnabled={false} />
    </GameProvider>
  );
}

/** Part way to the daily goal. */
export const InProgress: Story = {
  args: { children: question(0) },
};

/** The first question of a session: nothing answered, the bar is empty. */
export const FirstQuestion: Story = {
  args: { answered: 0, goalFraction: 0, children: question(2) },
};

/** The goal is met. The bar stays full and the session keeps going. */
export const GoalMet: Story = {
  args: { answered: 18, goalFraction: 1, children: question(1) },
};

/** A new word is introduced before it is ever quizzed. */
export const NewWordIntroduction: Story = {
  args: {
    children: (
      <GameProvider value={{ pool: POOL, profile: profile() }}>
        <WordIntro content={SESSION_ITEMS[3]!.content} onStart={() => {}} />
      </GameProvider>
    ),
  },
};

/** Committing the answer: the screen dims behind a spinner. */
export const Submitting: Story = {
  args: { submitting: true, children: question(1) },
};

/** Building the opening queue. */
export const Loading: StoryObj = {
  render: () => <SessionLoading />,
  decorators: [phone],
};

/** Nothing due and no new words: the session offers practice instead. */
export const NothingScheduled: StoryObj = {
  render: () => <SessionNothingScheduled onPractice={() => {}} onBack={() => {}} />,
  decorators: [phone],
};

/** A refill came back empty part way through, so the queue is worked dry. */
export const RanDry: StoryObj = {
  render: () => <SessionRanDry answered={23} onPractice={() => {}} onFinish={() => {}} />,
  decorators: [phone],
};

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { GameProvider } from '@/features/games/GameContext';
import { GameHost } from '@/features/games/GameHost';
import { WordIntro } from '@/features/games/WordIntro';
import { POOL, profile, SESSION_ITEMS } from '@/stories/fixtures';
import { phone } from '@/stories/decorators';
import { SessionCaughtUp, SessionLoading, SessionRunner } from './SessionView';

// The runner is the frame around a question: progress bar, counter, close
// button and the submitting overlay. These stories put a real game mode inside
// it, so the snapshot is what a session actually looks like.
const meta = {
  title: 'Screens/Session',
  component: SessionRunner,
  args: {
    index: 0,
    total: SESSION_ITEMS.length,
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

/** First question of five: the progress bar is empty, the counter reads 1/5. */
export const FirstQuestion: Story = {
  args: { children: question(0) },
};

/** Part way through. */
export const MidSession: Story = {
  args: { index: 2, children: question(2) },
};

/** Last question: the bar is nearly full. */
export const LastQuestion: Story = {
  args: { index: 4, children: question(1) },
};

/** A new word is introduced before it is ever quizzed. */
export const NewWordIntroduction: Story = {
  args: {
    index: 3,
    children: (
      <GameProvider value={{ pool: POOL, profile: profile() }}>
        <WordIntro content={SESSION_ITEMS[3]!.content} onStart={() => {}} />
      </GameProvider>
    ),
  },
};

/** Committing the answer: the screen dims behind a spinner. */
export const Submitting: Story = {
  args: { index: 1, submitting: true, children: question(1) },
};

/** A one-item session, where the counter reads 1/1 from the start. */
export const SingleItem: Story = {
  args: { total: 1, children: question(0) },
};

/** Loading the plan. */
export const Loading: StoryObj = {
  render: () => <SessionLoading />,
  decorators: [phone],
};

/** Nothing due and the day's new words are done. */
export const CaughtUp: StoryObj = {
  render: () => <SessionCaughtUp onBack={() => {}} />,
  decorators: [phone],
};

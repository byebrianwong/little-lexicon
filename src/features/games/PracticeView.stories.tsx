import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { phone } from '@/stories/decorators';
import { POOL, profile, WORDS } from '@/stories/fixtures';
import type { SessionItem } from '@/lib/types';
import { GameProvider } from './GameContext';
import { GameHost } from './GameHost';
import { PracticeEmpty, PracticeLoading, PracticeRunner } from './PracticeView';

// Practice reuses the same game modes as a session, so these stories show the
// header that is unique to it: a running count and accuracy instead of progress.
const item: SessionItem = { content: WORDS[3]!, state: null, isNew: false };

const meta = {
  title: 'Screens/Practice',
  component: PracticeRunner,
  args: {
    answered: 8,
    correct: 6,
    onClose: () => {},
    children: (
      <GameProvider value={{ pool: POOL, profile: profile() }}>
        <GameHost item={item} mode="cloze" onOutcome={() => {}} soundEnabled={false} />
      </GameProvider>
    ),
  },
  decorators: [phone],
} satisfies Meta<typeof PracticeRunner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Part way into a run. Accuracy is the score for this run only. */
export const InProgress: Story = {};

/** The first question of a run: accuracy has nothing to average, so it reads a dash. */
export const FirstQuestion: Story = {
  args: { answered: 0, correct: 0 },
};

/** A long, flawless run. */
export const PerfectRun: Story = {
  args: { answered: 42, correct: 42 },
};

/** Loading the collection. */
export const Loading: StoryObj = {
  render: () => <PracticeLoading />,
  decorators: [phone],
};

/** An empty collection. */
export const NoWords: StoryObj = {
  render: () => <PracticeEmpty onBack={() => {}} />,
  decorators: [phone],
};

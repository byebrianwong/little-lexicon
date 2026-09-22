import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { phone } from '@/stories/decorators';
import type { Option } from './optionPool';
import { SpeedEmpty, SpeedLoading, SpeedRoundView } from './SpeedView';

const OPTIONS: Option[] = [
  { text: 'Found everywhere at once.', correct: true },
  { text: 'Rare and hard to find.', correct: false },
  { text: 'Loud and hard to ignore.', correct: false },
  { text: 'Owed as a debt.', correct: false },
];

const meta = {
  title: 'Screens/SpeedRound',
  component: SpeedRoundView,
  args: {
    headword: 'ubiquitous',
    options: OPTIONS,
    chosen: null,
    remaining: 47,
    answeredCount: 6,
    onChoose: () => {},
    onClose: () => {},
  },
  decorators: [phone],
} satisfies Meta<typeof SpeedRoundView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mid-round, question open. */
export const Question: Story = {};

/** The start of a round: full timer, nothing answered. */
export const RoundStart: Story = {
  args: { remaining: 60, answeredCount: 0 },
};

/**
 * Answered right. The round does not stop for a reveal: options colour for a
 * moment and the next word arrives.
 */
export const AnsweredCorrectly: Story = {
  args: { chosen: OPTIONS[0] },
};

/** Answered wrong: the tapped option is red and the right one green. */
export const AnsweredIncorrectly: Story = {
  args: { chosen: OPTIONS[1] },
};

/** The last seconds. */
export const AlmostOutOfTime: Story = {
  args: { remaining: 3, answeredCount: 21 },
};

/** Time up. The bar is empty and the clock reads zero, never a negative. */
export const TimeUp: Story = {
  args: { remaining: -2, answeredCount: 24 },
};

/** A long headword, which sets the widest the title can get. */
export const LongHeadword: Story = {
  args: { headword: 'incomprehensibility' },
};

/** Building the queue. */
export const Loading: StoryObj = {
  render: () => <SpeedLoading />,
  decorators: [phone],
};

/** No words learned yet. */
export const NothingToRace: StoryObj = {
  render: () => <SpeedEmpty onBack={() => {}} />,
  decorators: [phone],
};

import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
import { game } from '@/stories/decorators';
import { reviewItem } from '@/stories/fixtures';
import { Cloze } from './Cloze';

const meta = {
  title: 'Games/Cloze',
  component: Cloze,
  args: {
    item: reviewItem('ephemeral'),
    mode: 'cloze',
    soundEnabled: false,
    onOutcome: () => {},
  },
  decorators: [game],
} satisfies Meta<typeof Cloze>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The blanked sentence and an empty box. Check is disabled until something is typed. */
export const Unanswered: Story = {};

/** A typed answer enables Check. */
export const Typing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText('Type the word'), 'ephem');
  },
};

/** The hint puts the first letter in the placeholder and turns Hint into Reveal answer. */
export const HintUsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Hint'));
    await expect(await canvas.findByPlaceholderText('Starts with "e"')).toBeInTheDocument();
  },
};

/** A correct spelling. */
export const AnsweredCorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText('Type the word'), 'ephemeral');
    await userEvent.click(canvas.getByText('Check'));
    await expect(await canvas.findByText('Correct')).toBeInTheDocument();
  },
};

/** A wrong word: the reveal shows the answer that was wanted. */
export const AnsweredIncorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText('Type the word'), 'permanent');
    await userEvent.click(canvas.getByText('Check'));
    await expect(await canvas.findByText('Not quite')).toBeInTheDocument();
  },
};

/** A longer sentence with a different target word, to show the blank mid-clause. */
export const LongerSentence: Story = {
  args: { item: reviewItem('obfuscate') },
};

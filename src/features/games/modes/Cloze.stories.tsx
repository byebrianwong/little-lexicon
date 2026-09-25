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

/**
 * The hint shows the first letter and the length under the box, where it stays
 * visible after typing starts, and turns Hint into Show answer.
 */
export const HintUsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Hint'));
    await expect(await canvas.findByText(/Starts with "e"/)).toBeInTheDocument();
    await expect(canvas.getByText('Show answer')).toBeInTheDocument();
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

/** A typo within tolerance is accepted, but the reveal points out the slip. */
export const AnsweredNearMiss: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText('Type the word'), 'ephimeral');
    await userEvent.click(canvas.getByText('Check'));
    await expect(await canvas.findByText('Close enough')).toBeInTheDocument();
    await expect(canvas.getByText('You typed "ephimeral"')).toBeInTheDocument();
  },
};

/** A wrong word: the reveal shows what was typed beside the answer that was wanted. */
export const AnsweredIncorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText('Type the word'), 'permanent');
    await userEvent.click(canvas.getByText('Check'));
    await expect(await canvas.findByText('Not quite')).toBeInTheDocument();
    await expect(canvas.getByText('You typed "permanent"')).toBeInTheDocument();
  },
};

/** Giving up after the hint counts as wrong. Nothing was typed, so no attempt is shown. */
export const GaveUp: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Hint'));
    await userEvent.click(await canvas.findByText('Show answer'));
    await expect(await canvas.findByText('Not quite')).toBeInTheDocument();
  },
};

/** A longer sentence with a different target word, to show the blank mid-clause. */
export const LongerSentence: Story = {
  args: { item: reviewItem('obfuscate') },
};

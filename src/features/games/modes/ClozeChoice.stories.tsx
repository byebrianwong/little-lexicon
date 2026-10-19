import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
import { game } from '@/stories/decorators';
import { reviewItem } from '@/stories/fixtures';
import { ClozeChoice } from './ClozeChoice';

const meta = {
  title: 'Games/ClozeChoice',
  component: ClozeChoice,
  args: {
    item: reviewItem('ephemeral'),
    mode: 'cloze_choice',
    soundEnabled: false,
    onOutcome: () => {},
  },
  decorators: [game],
} satisfies Meta<typeof ClozeChoice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A sentence with the word blanked, and four adjectives to fill it. */
export const Unanswered: Story = {};

/** The right word: the reveal shows the whole sentence and the definition. */
export const AnsweredCorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('ephemeral'));
    await expect(await canvas.findByText('Correct')).toBeInTheDocument();
  },
};

/** A wrong word: the chosen option red, the right one green. */
export const AnsweredIncorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('laconic'));
    await expect(await canvas.findByText('Not quite')).toBeInTheDocument();
  },
};

/** The 50/50 hint dims one wrong word and disables the hint button. */
export const HintUsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Hint (50/50)'));
  },
};

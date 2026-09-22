import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
import { game } from '@/stories/decorators';
import { reviewItem } from '@/stories/fixtures';
import { Listening } from './Listening';

const meta = {
  title: 'Games/Listening',
  component: Listening,
  args: {
    item: reviewItem('sycophant'),
    mode: 'listening',
    soundEnabled: false,
    onOutcome: () => {},
  },
  decorators: [game],
} satisfies Meta<typeof Listening>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The word is spoken, not shown. Only the options and a replay button appear. */
export const Unanswered: Story = {};

/** Heard it right. */
export const AnsweredCorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('sycophant'));
    await expect(await canvas.findByText('Correct')).toBeInTheDocument();
  },
};

/** Picked a different word. */
export const AnsweredIncorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wrong = canvas
      .getAllByRole('button')
      .find((b) => (b.textContent ?? '') !== 'sycophant' && !(b.textContent ?? '').includes('Play'));
    if (wrong) await userEvent.click(wrong);
    await expect(await canvas.findByText('Not quite')).toBeInTheDocument();
  },
};

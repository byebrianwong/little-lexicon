import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
import { game } from '@/stories/decorators';
import { reviewItem } from '@/stories/fixtures';
import { UseIt } from './UseIt';

// Evaluation runs through the backend. Storybook has no Supabase configured, so
// that is the in-memory demo backend, whose check is a local heuristic: the
// sentence must contain the word and be at least five words long. The three
// answered stories below cover each branch it can return.
const meta = {
  title: 'Games/UseIt',
  component: UseIt,
  args: {
    item: reviewItem('pragmatic'),
    mode: 'use_it',
    soundEnabled: false,
    onOutcome: () => {},
  },
  decorators: [game],
} satisfies Meta<typeof UseIt>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty box. Get feedback stays disabled until three words are typed. */
export const Unanswered: Story = {};

/** Enough typed to submit. */
export const Typing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByPlaceholderText('Use "pragmatic" naturally...'),
      'A pragmatic choice',
    );
  },
};

/** A sentence that uses the word in context. */
export const FeedbackPositive: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByPlaceholderText('Use "pragmatic" naturally...'),
      'She took a pragmatic view and shipped the smaller fix first.',
    );
    await userEvent.click(canvas.getByText('Get feedback'));
    await expect(await canvas.findByText(/natural context/)).toBeInTheDocument();
  },
};

/** A sentence that never uses the word. */
export const FeedbackNegative: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByPlaceholderText('Use "pragmatic" naturally...'),
      'I made a sensible decision about the deadline.',
    );
    await userEvent.click(canvas.getByText('Get feedback'));
    await expect(await canvas.findByText(/actually use/)).toBeInTheDocument();
  },
};

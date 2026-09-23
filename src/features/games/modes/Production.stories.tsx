import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
import { game } from '@/stories/decorators';
import { reviewItem } from '@/stories/fixtures';
import { Production } from './Production';

const meta = {
  title: 'Games/Production',
  component: Production,
  args: {
    item: reviewItem('laconic'),
    mode: 'production',
    soundEnabled: false,
    onOutcome: () => {},
  },
  decorators: [game],
} satisfies Meta<typeof Production>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Recall the word from a cue. The hardest mode in the ladder. The cue is either
 * the definition or a synonym, chosen per word by a seeded draw; this one draws
 * the synonym.
 */
export const Unanswered: Story = {};

/** The hint shows the first third of the word and its length. */
export const HintUsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Hint'));
    await expect(await canvas.findByText(/letters/)).toBeInTheDocument();
  },
};

/** Exact spelling. */
export const AnsweredCorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText('Your answer'), 'laconic');
    await userEvent.click(canvas.getByText('Check'));
    await expect(await canvas.findByText('Correct')).toBeInTheDocument();
  },
};

/** A near miss is still graded: only the target headword counts. */
export const AnsweredIncorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText('Your answer'), 'terse');
    await userEvent.click(canvas.getByText('Check'));
    await expect(await canvas.findByText('Not quite')).toBeInTheDocument();
  },
};

/** A word whose cue is the definition rather than a synonym. */
export const DefinitionPrompt: Story = {
  args: { item: reviewItem('pernicious') },
};

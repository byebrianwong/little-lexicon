import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { column } from '@/stories/decorators';
import { word } from '@/stories/fixtures';
import { Reveal } from './Reveal';

const content = word('insidious');

const meta = {
  title: 'Games/Reveal',
  component: Reveal,
  args: {
    correct: true,
    content,
    example: content.senses[0]?.examples[0] ?? null,
    soundEnabled: false,
    onContinue: () => {},
  },
  decorators: [column],
} satisfies Meta<typeof Reveal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Shown after every mode, so its two states are the most-seen panels in the app. */
export const Correct: Story = {};

export const Incorrect: Story = {
  args: { correct: false },
};

/** After a graded review the panel also says when the word comes back. */
export const WithNextDue: Story = {
  args: { nextDueLabel: 'in 8 days' },
};

/** A word with no example sentence still reveals cleanly. */
export const WithoutExample: Story = {
  args: { example: null },
};

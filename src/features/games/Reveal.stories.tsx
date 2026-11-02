import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { game } from '@/stories/decorators';
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
  // The game decorator supplies the saved words, so the Save control shows.
  decorators: [game],
} satisfies Meta<typeof Reveal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Shown after every mode, so its two states are the most-seen panels in the
 * app. insidious has a Watch out note, which the panel shows under the
 * definition; it is the only extra the panel shows.
 */
export const Correct: Story = {};

export const Incorrect: Story = {
  args: { correct: false },
};

/** A typed answer with a typo inside tolerance: accepted, with the slip pointed out. */
export const NearMiss: Story = {
  args: { correct: true, attempt: { text: 'insiduous', grade: 'near' } },
};

/** A typed wrong answer sits next to the word that was wanted. */
export const IncorrectWithAttempt: Story = {
  args: { correct: false, attempt: { text: 'invidious', grade: 'wrong' } },
};

/** After a graded review the panel also says when the word comes back. */
export const WithNextDue: Story = {
  args: { nextDueLabel: 'in 8 days' },
};

/** A word with no Watch out note: nothing is added under the definition. */
export const WithoutWatchOut: Story = {
  args: {
    content: word('ephemeral'),
    example: word('ephemeral').senses[0]?.examples[0] ?? null,
  },
};

/** A word with no example sentence still reveals cleanly. */
export const WithoutExample: Story = {
  args: { example: null },
};

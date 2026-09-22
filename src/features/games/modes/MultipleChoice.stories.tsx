import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
import { game } from '@/stories/decorators';
import { newItem, reviewItem } from '@/stories/fixtures';
import { MultipleChoice } from './MultipleChoice';

const meta = {
  title: 'Games/MultipleChoice',
  component: MultipleChoice,
  args: {
    item: reviewItem('ephemeral'),
    mode: 'mc_word_to_def',
    soundEnabled: false,
    onOutcome: () => {},
  },
  decorators: [game],
} satisfies Meta<typeof MultipleChoice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Show the word, pick the meaning. The most common question in the app. */
export const WordToDefinition: Story = {};

/** Show the meaning, pick the word. */
export const DefinitionToWord: Story = {
  args: { mode: 'mc_def_to_word', item: newItem('quixotic') },
};

/** After a correct answer: the reveal panel with the definition and audio. */
export const AnsweredCorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Lasting for a very short time.'));
    await expect(await canvas.findByText('Correct')).toBeInTheDocument();
  },
};

/** After a wrong answer: the chosen option red, the right one green. */
export const AnsweredIncorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Lasting a very long time.'));
    await expect(await canvas.findByText('Not quite')).toBeInTheDocument();
  },
};

/** The 50/50 hint dims one wrong option and disables the hint button. */
export const HintUsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Hint (50/50)'));
  },
};

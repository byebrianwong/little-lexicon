import { useState } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { phone } from '@/stories/decorators';
import { NO_WORDS, STORY_NOW, word, YOUR_WORDS } from '@/stories/fixtures';
import { WordsLayout } from '@/features/browse/WordsLayout';
import { LearningView, type LearningViewProps } from './LearningView';
import type { WordStatus } from './wordProgress';

const learningTab: Decorator = (Story) => (
  <WordsLayout view="learning" onChangeView={() => {}} listCount={2}>
    <Story />
  </WordsLayout>
);

/** The screen keeps the chosen list; here the story does. */
function Stateful(props: LearningViewProps) {
  const [status, setStatus] = useState<WordStatus>(props.status);
  return (
    <LearningView
      {...props}
      status={status}
      onChangeStatus={(s) => {
        props.onChangeStatus(s);
        setStatus(s);
      }}
    />
  );
}

const meta = {
  title: 'Screens/Words/Learning',
  component: LearningView,
  args: {
    words: YOUR_WORDS,
    failed: false,
    onRetry: fn(),
    status: 'learning',
    onChangeStatus: fn(),
    soundEnabled: true,
    onToggleSave: fn(),
    onStartSession: fn(),
    now: STORY_NOW,
  },
  render: (args) => <Stateful {...args} />,
  decorators: [learningTab, phone],
} satisfies Meta<typeof LearningView>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Words in progress, most recently answered first. Each row shows the days
 * toward known, the answers and the next review.
 */
export const Learning: Story = {};

/** The words the review schedule brings back now, as Home's "Due now" opens it. */
export const Due: Story = {
  args: { status: 'due' },
};

/** Words right on five separate days with no mistake since. */
export const Known: Story = {
  args: { status: 'known' },
};

/** An open row lists every fact about the word, with its audio and Save. */
export const RowExpanded: Story = {
  args: { initialOpenId: word('laconic').wordId },
};

/** The switch changes the list. */
export const SwitchingLists: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Known, 2 words' }));
    await expect(args.onChangeStatus).toHaveBeenCalledWith('known');
    await expect(await canvas.findByText('ephemeral')).toBeInTheDocument();
    await expect(canvas.queryByText('laconic')).not.toBeInTheDocument();
  },
};

/** Tapping a row opens it; the facts come from its answers and its schedule. */
export const OpeningARow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('laconic'));
    await expect(await canvas.findByText('First tested')).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Saved: laconic. Remove it from saved words' }),
    );
    await expect(args.onToggleSave).toHaveBeenCalledWith(
      expect.objectContaining({ headword: 'laconic' }),
    );
  },
};

/** A list with nothing in it says so. */
export const NothingDue: Story = {
  args: { status: 'due', words: { ...YOUR_WORDS, due: [] } },
};

/** A new account: nothing answered yet, so the view points to a session. */
export const NoWordsYet: Story = {
  args: { words: NO_WORDS },
};

/** Reading the answers and the schedule. */
export const Loading: Story = {
  args: { words: undefined },
};

/** A read failed. */
export const Failed: Story = {
  args: { words: undefined, failed: true },
};

import type { Decorator, Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { WordsLayout } from '@/features/browse/WordsLayout';
import { phone } from '@/stories/decorators';
import { word } from '@/stories/fixtures';
import type { ListedWord } from '@/lib/types';
import type { WordTracker } from '@/features/tracker/tracker';
import { WordListView } from './WordListView';

const ENTRIES: ListedWord[] = [
  { content: word('sycophant'), addedAt: '2026-01-19T09:00:00.000Z' },
  { content: word('quixotic'), addedAt: '2026-01-19T09:02:00.000Z' },
  { content: word('capricious'), addedAt: '2026-01-19T09:05:00.000Z' },
];

// Answers in the past week, so the line does not depend on today's date.
const TRACKERS = new Map<number, WordTracker>([
  [
    word('quixotic').wordId,
    {
      wordId: word('quixotic').wordId,
      status: 'learning',
      cleanDays: 2,
      answeredRecently: 4,
      mistakeRecently: true,
      latestRight: 3,
      latestCount: 4,
      lastAnsweredAt: new Date().toISOString(),
    },
  ],
  [
    word('sycophant').wordId,
    {
      wordId: word('sycophant').wordId,
      status: 'known',
      cleanDays: 6,
      answeredRecently: 1,
      mistakeRecently: false,
      latestRight: 5,
      latestCount: 5,
      lastAnsweredAt: new Date().toISOString(),
    },
  ],
]);

const saved: Decorator = (Story, { args }) => {
  const entries = (args as { entries?: ListedWord[] }).entries;
  return (
    <WordsLayout view="list" onChangeView={() => {}} listCount={entries?.length}>
      <Story />
    </WordsLayout>
  );
};

const meta = {
  title: 'Screens/Words/Saved',
  component: WordListView,
  args: {
    entries: ENTRIES,
    isLoading: false,
    trackers: TRACKERS,
    onRemove: fn(),
    onStartSession: fn(),
    onPractice: fn(),
    onDiscover: fn(),
  },
  decorators: [saved, phone],
} satisfies Meta<typeof WordListView>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Saved words, newest first, each with its tracker: one known, one being
 * learned, one not tested yet. The count shows on the switch.
 */
export const ThreeWords: Story = {};

/** Remove passes the word's id up; the screen does the writing. */
export const RemoveAWord: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove quixotic from saved words' }),
    );
    await expect(args.onRemove).toHaveBeenCalledWith(ENTRIES[1]!.content.wordId);
  },
};

/** Nothing saved yet: says how the list fills and links back to Discover. */
export const Empty: Story = {
  args: { entries: [] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Go to Discover' }));
    await expect(args.onDiscover).toHaveBeenCalled();
  },
};

export const Loading: Story = {
  args: { entries: undefined, isLoading: true },
};

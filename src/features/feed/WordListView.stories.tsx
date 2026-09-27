import type { Decorator, Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { WordsLayout } from '@/features/browse/WordsLayout';
import { phone } from '@/stories/decorators';
import { word } from '@/stories/fixtures';
import type { ListedWord } from '@/lib/types';
import { WordListView } from './WordListView';

const ENTRIES: ListedWord[] = [
  { content: word('sycophant'), addedAt: '2026-01-19T09:00:00.000Z' },
  { content: word('quixotic'), addedAt: '2026-01-19T09:02:00.000Z' },
  { content: word('capricious'), addedAt: '2026-01-19T09:05:00.000Z' },
];

const yourList: Decorator = (Story, { args }) => {
  const entries = (args as { entries?: ListedWord[] }).entries;
  return (
    <WordsLayout view="list" onChangeView={() => {}} listCount={entries?.length}>
      <Story />
    </WordsLayout>
  );
};

const meta = {
  title: 'Screens/Words/Your list',
  component: WordListView,
  args: {
    entries: ENTRIES,
    isLoading: false,
    onRemove: fn(),
    onStartSession: fn(),
    onDiscover: fn(),
  },
  decorators: [yourList, phone],
} satisfies Meta<typeof WordListView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Words waiting for a session, oldest pick first. The count shows on the switch. */
export const ThreeWords: Story = {};

/** Remove passes the word's id up; the screen does the writing. */
export const RemoveAWord: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove quixotic from your list' }),
    );
    await expect(args.onRemove).toHaveBeenCalledWith(ENTRIES[1]!.content.wordId);
  },
};

/** Nothing picked yet: says how the list fills and links back to Discover. */
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

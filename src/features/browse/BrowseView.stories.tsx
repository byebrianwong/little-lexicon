import type { Decorator, Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { phone } from '@/stories/decorators';
import { WORDS, word } from '@/stories/fixtures';
import type { WordTracker } from '@/features/tracker/tracker';
import { BrowseView } from './BrowseView';
import { WordsLayout } from './WordsLayout';

const allWords: Decorator = (Story) => (
  <WordsLayout view="all" onChangeView={() => {}} listCount={2}>
    <Story />
  </WordsLayout>
);

const meta = {
  title: 'Screens/Words/All words',
  component: BrowseView,
  args: {
    words: WORDS,
    isLoading: false,
    soundEnabled: true,
    savedIds: new Set<number>(),
    trackers: new Map(),
    onToggleSave: fn(),
  },
  decorators: [allWords, phone],
} satisfies Meta<typeof BrowseView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The collection, collapsed. Each row shows the word, tier and meaning. */
export const List: Story = {};

/** An open row adds the example, the memory hook and the audio buttons. */
export const RowExpanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('ephemeral'));
    await expect(await canvas.findByText('Memory hook')).toBeInTheDocument();
  },
};

/** An open row can save its word; the screen does the writing. */
export const SavingFromRow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('ephemeral'));
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save for later: ephemeral' }),
    );
    await expect(args.onToggleSave).toHaveBeenCalledWith(
      expect.objectContaining({ headword: 'ephemeral' }),
    );
  },
};

/** Search narrows on the headword and on the meaning, and the count follows. */
export const Searching: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText('Search words and meanings'), 'short');
    await expect(await canvas.findByText('ephemeral')).toBeInTheDocument();
  },
};

/** A search that matches nothing. */
export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText('Search words and meanings'), 'zzzz');
    await expect(await canvas.findByText('No word matches that search.')).toBeInTheDocument();
  },
};

/** The filters, open: tier, status and part of speech. */
export const FiltersOpen: Story = {
  args: { initialFiltersOpen: true },
};

/** Choosing tier 2 keeps only the tier 2 words, and the button counts it. */
export const FilteredByTier: Story = {
  args: { initialFiltersOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Tier 2' }));
    await expect(await canvas.findByText('Filters (1)')).toBeInTheDocument();
    await expect(canvas.getByText('pragmatic')).toBeInTheDocument();
    await expect(canvas.getByText('eloquent')).toBeInTheDocument();
    await expect(canvas.queryByText('ephemeral')).not.toBeInTheDocument();
  },
};

const learning: WordTracker = {
  wordId: word('laconic').wordId,
  status: 'learning',
  cleanDays: 2,
  answeredRecently: 3,
  mistakeRecently: false,
  latestRight: 3,
  latestCount: 3,
  lastAnsweredAt: '2026-01-18T09:00:00.000Z',
};

/** The status filter reads saved words and the word tracker. */
export const FilteredByStatus: Story = {
  args: {
    initialFiltersOpen: true,
    savedIds: new Set([word('quixotic').wordId]),
    trackers: new Map([[learning.wordId, learning]]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Learning' }));
    await expect(await canvas.findByText('laconic')).toBeInTheDocument();
    await expect(canvas.queryByText('quixotic')).not.toBeInTheDocument();
  },
};

/** Filters that match nothing say so, and can be cleared. */
export const NoFilterMatches: Story = {
  args: { initialFiltersOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Tier 1' }));
    await expect(await canvas.findByText('No word matches these filters.')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  },
};

/** Fetching the collection. */
export const Loading: Story = {
  args: { words: undefined, isLoading: true },
};

/** A collection with nothing in it yet. */
export const EmptyCollection: Story = {
  args: { words: [] },
};

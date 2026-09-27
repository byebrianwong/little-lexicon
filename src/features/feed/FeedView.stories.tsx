import type { Decorator, Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { WordsLayout } from '@/features/browse/WordsLayout';
import { phone } from '@/stories/decorators';
import { word } from '@/stories/fixtures';
import { FeedView } from './FeedView';

const FIRST = word('sycophant');
const WORDS = [FIRST, word('obfuscate'), word('eloquent'), word('quixotic')];

// The feed fills the Words tab under its title and view switch, so the frame
// is part of every snapshot.
const discover: Decorator = (Story, { args }) => (
  <WordsLayout
    view="discover"
    onChangeView={() => {}}
    listCount={(args as { listCount?: number }).listCount}
  >
    <Story />
  </WordsLayout>
);

const meta = {
  title: 'Screens/Words/Discover',
  component: FeedView,
  args: {
    words: WORDS,
    isLoading: false,
    isLoadingMore: false,
    failed: false,
    exhausted: false,
    onLoadMore: fn(),
    statuses: {},
    onLearn: fn(),
    onUnlearn: fn(),
    onKnow: fn(),
    onUnknow: fn(),
    onVisibleWord: fn(),
    notice: null,
    listCount: 0,
    onOpenList: fn(),
    onStartSession: fn(),
    soundEnabled: true,
  },
  decorators: [discover, phone],
} satisfies Meta<typeof FeedView>;

export default meta;
type Story = StoryObj<typeof meta>;

// The pages size themselves from a measurement, so each story waits for the
// word before the snapshot is taken.
async function showsFirstWord(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await expect(await canvas.findByText(FIRST.headword)).toBeInTheDocument();
  return canvas;
}

/** The first word, untouched, with the hint about scrolling. */
export const FirstWord: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await showsFirstWord(canvasElement);
    await expect(canvas.getByText('Scroll for the next word')).toBeInTheDocument();
  },
};

/** Tapping Learn this passes the word up; the screen does the writing. */
export const TapLearnThis: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = await showsFirstWord(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: `Learn this: ${FIRST.headword}` }));
    await expect(args.onLearn).toHaveBeenCalledWith(FIRST);
  },
};

/** Added to the list: the buttons give way to a line and an Undo. */
export const OnYourList: Story = {
  args: { statuses: { [FIRST.wordId]: 'listed' }, listCount: 1 },
  play: async ({ canvasElement, args }) => {
    const canvas = await showsFirstWord(canvasElement);
    await expect(canvas.getByText('On your list')).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: `Undo: take ${FIRST.headword} off your list` }),
    );
    await expect(args.onUnlearn).toHaveBeenCalledWith(FIRST);
  },
};

/** "I know it" while the word is still on screen: nothing is stored yet, so Undo is offered. */
export const KnownNotYetSaved: Story = {
  args: { statuses: { [FIRST.wordId]: 'pendingKnown' } },
  play: async ({ canvasElement }) => {
    const canvas = await showsFirstWord(canvasElement);
    await expect(
      canvas.getByRole('button', { name: `Undo: ${FIRST.headword} is not known` }),
    ).toBeInTheDocument();
  },
};

/** Stored as known after scrolling away and back. There is no undo at this point. */
export const KnownSaved: Story = {
  args: { statuses: { [FIRST.wordId]: 'known' } },
  play: async ({ canvasElement }) => {
    const canvas = await showsFirstWord(canvasElement);
    await expect(canvas.getByText('Marked as known')).toBeInTheDocument();
    await expect(canvas.queryByText('Undo')).not.toBeInTheDocument();
  },
};

/** A write failed. The message sits over the top of the page. */
export const SaveFailed: Story = {
  args: { notice: `Could not add “${FIRST.headword}” to your list. Try again.` },
  play: async ({ canvasElement }) => {
    const canvas = await showsFirstWord(canvasElement);
    await expect(canvas.getByText(/Could not add/)).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { words: [], isLoading: true },
};

/** The first page did not load. */
export const LoadFailed: Story = {
  args: { words: [], failed: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Try again' }));
    await expect(args.onLoadMore).toHaveBeenCalled();
  },
};

/** Every unseen word has been shown, and some are waiting on the list. */
export const EndWithList: Story = {
  args: { words: [], exhausted: true, listCount: 3 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('That is every new word.')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Start a session' }));
    await expect(args.onStartSession).toHaveBeenCalled();
  },
};

/** The end, with nothing on the list: no buttons. */
export const EndWithEmptyList: Story = {
  args: { words: [], exhausted: true, listCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('That is every new word.')).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Start a session' })).not.toBeInTheDocument();
  },
};

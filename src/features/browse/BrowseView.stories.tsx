import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
import { phone } from '@/stories/decorators';
import { WORDS } from '@/stories/fixtures';
import { BrowseView } from './BrowseView';

const meta = {
  title: 'Screens/Browse',
  component: BrowseView,
  args: {
    words: WORDS,
    isLoading: false,
    soundEnabled: true,
  },
  decorators: [phone],
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

/** Fetching the collection. */
export const Loading: Story = {
  args: { words: undefined, isLoading: true },
};

/** A collection with nothing in it yet. */
export const EmptyCollection: Story = {
  args: { words: [] },
};

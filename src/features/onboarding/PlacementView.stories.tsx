import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { phone } from '@/stories/decorators';
import { word } from '@/stories/fixtures';
import { PLACEMENT_LENGTH } from './placement';
import { PlacementLoading, PlacementView } from './PlacementView';

const meta = {
  title: 'Screens/Onboarding Placement',
  component: PlacementView,
  args: {
    word: word('laconic'),
    answeredCount: 0,
    total: PLACEMENT_LENGTH,
    onAnswer: () => {},
    onHear: () => {},
  },
  decorators: [phone],
} satisfies Meta<typeof PlacementView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The first question. The progress bar is empty. */
export const FirstQuestion: Story = {};

/** Part way through, on a harder word than the one before. */
export const MidTest: Story = {
  args: { answeredCount: 5, word: word('pernicious') },
};

/** The last question. */
export const LastQuestion: Story = {
  args: { answeredCount: PLACEMENT_LENGTH - 1, word: word('quixotic') },
};

/** A word with no IPA on file. The audio button stays: speech is synthesized. */
export const WithoutPronunciation: Story = {
  args: { word: { ...word('eloquent'), ipa: null } },
};

/** Fetching the placement words. */
export const Loading: StoryObj = {
  render: () => <PlacementLoading />,
  decorators: [phone],
};

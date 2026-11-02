import type { Decorator, Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { expect, userEvent, within } from 'storybook/test';
import { GameProvider } from '@/features/games/GameContext';
import { NEW_PROFILE, POOL, profile, WORDS, withoutExtras, word } from '@/stories/fixtures';
import { WordIntro } from './WordIntro';

const meta = {
  title: 'Games/WordIntro',
  component: WordIntro,
  args: {
    content: word('quixotic'),
    collection: WORDS,
    onStart: () => {},
  },
  decorators: [
    (Story) => (
      <View style={{ width: 350 }}>
        <GameProvider value={{ pool: POOL, profile: profile() }}>
          <Story />
        </GameProvider>
      </View>
    ),
  ],
} satisfies Meta<typeof WordIntro>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What a learner sees the first time a word appears in a session. */
export const NewWord: Story = {};

/**
 * Every extra: the tone label, Watch out under the definition, Similar,
 * Opposite and Origin, then "More about this word" opened to show Also means,
 * Often used and Same root.
 */
export const EveryExtra: Story = {
  args: { content: word('loquacious') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Watch out')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'More about this word' }));
    await expect(await canvas.findByText('Same root')).toBeInTheDocument();
  },
};

/** A word with none of the extras: the card is as it was before them, with no toggle. */
export const NoExtras: Story = {
  args: { content: withoutExtras(word('quixotic')) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Similar')).not.toBeInTheDocument();
    await expect(canvas.queryByText('More about this word')).not.toBeInTheDocument();
  },
};

/** A verb rather than an adjective, with a longer example sentence. */
export const Verb: Story = {
  args: { content: word('obfuscate') },
};

// Someone who skipped the interests step never sees "Make it personal", because
// there is nothing to personalize with. Everyone else does.
const noInterests: Decorator = (Story) => (
  <View style={{ width: 350 }}>
    <GameProvider value={{ pool: POOL, profile: NEW_PROFILE }}>
      <Story />
    </GameProvider>
  </View>
);

export const NoInterests: Story = {
  decorators: [noInterests],
};

/** After generating a personalized memory hook. */
export const Personalized: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Make it personal'));
    await expect(await canvas.findByText('For you')).toBeInTheDocument();
  },
};

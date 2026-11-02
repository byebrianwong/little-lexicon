import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Body, Headword, Label, Note } from './ui';
import { ExtraLines, MoreAboutWord, ToneLabel, WatchOut } from './WordExtras';
import { EXTRA_LINES, wordExtras } from '@/lib/wordExtras';
import type { WordContent } from '@/lib/types';
import { WORDS, withoutExtras, word } from '@/stories/fixtures';

// The extra lines on their own, set under a word's heading and definition the
// way the screens set them. One story per case; each is one snapshot.
const meta = {
  title: 'UI/Word extras',
  decorators: [
    (Story) => (
      <View style={{ width: 340 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Entry({
  content,
  onRootWord,
  children,
}: {
  content: WordContent;
  onRootWord?: (headword: string) => void;
  children?: React.ReactNode;
}) {
  const extras = wordExtras(content, WORDS);
  const sense = content.senses[0];
  return (
    <View>
      <Headword size="md">{content.headword}</Headword>
      <View className="mt-1 flex-row flex-wrap items-baseline gap-x-3">
        <Note>{content.partOfSpeech}</Note>
        <ToneLabel tone={extras.tone} />
        <Label>{`Tier ${content.difficultyTier}`}</Label>
      </View>
      <Body className="mt-3">{sense?.plainLanguageDefinition ?? sense?.definition}</Body>
      <WatchOut note={extras.watchOut} className="mt-3" />
      {children ?? (
        <ExtraLines
          extras={extras}
          lines={EXTRA_LINES}
          onRootWord={onRootWord ? (w) => onRootWord(w.headword) : undefined}
          className="mt-3"
        />
      )}
    </View>
  );
}

/**
 * Every extra: the tone label, Watch out, then Also means (with its own tone),
 * Similar, Opposite, Often used, Origin and Same root, in that order.
 */
export const EveryExtra: Story = {
  render: () => <Entry content={word('loquacious')} />,
};

const onRootWord = fn();

/** In All words, each Same root word is a link to that word's row. */
export const SameRootLinks: Story = {
  render: () => <Entry content={word('loquacious')} onRootWord={onRootWord} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: 'eloquent: show this word' }));
    await expect(onRootWord).toHaveBeenCalledWith('eloquent');
  },
};

/** A word with none of the extras: no label is left behind. */
export const NoExtras: Story = {
  render: () => <Entry content={withoutExtras(word('quixotic'))} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const label of ['Watch out', 'Similar', 'Opposite', 'Origin', 'Same root']) {
      await expect(canvas.queryByText(label)).not.toBeInTheDocument();
    }
  },
};

/** The new-word card keeps some lines behind this toggle. Closed. */
export const MoreClosed: Story = {
  render: () => (
    <Entry content={word('loquacious')}>
      <MoreAboutWord
        extras={wordExtras(word('loquacious'), WORDS)}
        lines={['alsoMeans', 'pairings', 'sameRoot']}
        className="mt-2"
      />
    </Entry>
  ),
};

/** Open, it shows Also means, Often used and Same root. */
export const MoreOpen: Story = {
  ...MoreClosed,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { name: 'More about this word' });
    await userEvent.click(toggle);
    await expect(await canvas.findByText('Also means')).toBeInTheDocument();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  },
};

/** With nothing behind it (ephemeral has no other meaning, pairing or root), there is no toggle. */
export const MoreWithNothing: Story = {
  render: () => (
    <Entry content={word('ephemeral')}>
      <MoreAboutWord
        extras={wordExtras(word('ephemeral'), WORDS)}
        lines={['alsoMeans', 'pairings', 'sameRoot']}
        className="mt-2"
      />
    </Entry>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('More about this word')).not.toBeInTheDocument();
  },
};

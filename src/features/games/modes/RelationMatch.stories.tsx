import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
import { game } from '@/stories/decorators';
import { reviewItem, word } from '@/stories/fixtures';
import { RelationMatch } from './RelationMatch';

const meta = {
  title: 'Games/RelationMatch',
  component: RelationMatch,
  args: {
    item: reviewItem('ephemeral'),
    mode: 'synonym_match',
    soundEnabled: false,
    onOutcome: () => {},
  },
  decorators: [game],
} satisfies Meta<typeof RelationMatch>;

export default meta;
type Story = StoryObj<typeof meta>;

// Which two synonyms end up on screen depends on a seeded shuffle, so the play
// functions click by relation rather than by a hard-coded pair.
async function clickAll(
  canvas: ReturnType<typeof within>,
  lemmas: string[],
): Promise<void> {
  for (const lemma of lemmas) {
    const hit = canvas.queryByText(lemma);
    if (hit) await userEvent.click(hit);
  }
}

function lemmasOf(headword: string, type: 'synonym' | 'antonym'): string[] {
  return word(headword)
    .relations.filter((r) => r.relationType === type)
    .map((r) => r.relatedLemma);
}

/** Pick every synonym. More than one answer is correct, which the hint line says. */
export const Synonyms: Story = {};

/** The antonym variant of the same mode. */
export const Antonyms: Story = {
  args: { mode: 'antonym_match', item: reviewItem('gregarious') },
};

/** Selected but not yet checked: chosen rows are outlined, Check is enabled. */
export const Selecting: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await clickAll(canvas, lemmasOf('ephemeral', 'synonym').slice(0, 1));
  },
};

/** All correct: every synonym green. */
export const AnsweredCorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await clickAll(canvas, lemmasOf('ephemeral', 'synonym'));
    await userEvent.click(canvas.getByText('Check'));
    await expect(await canvas.findByText('Correct')).toBeInTheDocument();
  },
};

/** A miss: the wrong pick is red, the answers that were wanted are green. */
export const AnsweredIncorrectly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Pick one distractor: any option that is not a synonym of the word.
    const synonyms = lemmasOf('ephemeral', 'synonym');
    const distractor = canvas
      .getAllByRole('button')
      .find((b) => {
        const label = (b.textContent ?? '').replace('\u2713', '').trim();
        return label !== '' && label !== 'Check' && !synonyms.includes(label);
      });
    if (distractor) await userEvent.click(distractor);
    await userEvent.click(canvas.getByText('Check'));
    await expect(await canvas.findByText('Not quite')).toBeInTheDocument();
  },
};

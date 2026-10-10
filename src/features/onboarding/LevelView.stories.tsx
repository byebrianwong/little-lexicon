import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { phone } from '@/stories/decorators';
import { WORD_LEVELS } from './levels';
import { LevelView } from './LevelView';

const meta = {
  title: 'Screens/Onboarding Level',
  component: LevelView,
  args: {
    onPick: fn(),
    onTakeTest: fn(),
  },
  decorators: [phone],
} satisfies Meta<typeof LevelView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The first screen a new learner sees. */
export const Fresh: Story = {};

/** Tapping a level picks it. */
export const PickingALevel: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Advanced'));
    await expect(args.onPick).toHaveBeenCalledWith(WORD_LEVELS[1]);
  },
};

/** The link under the levels opens the placement test. */
export const TakingTheTest: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Take a \d+-word test/));
    await expect(args.onTakeTest).toHaveBeenCalled();
  },
};

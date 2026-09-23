import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
import { phone } from '@/stories/decorators';
import { GoalsView } from './GoalsView';

const meta = {
  title: 'Screens/Onboarding Goals',
  component: GoalsView,
  args: {
    initialGoal: 15,
    initialInterests: [],
    levelEstimate: 3,
    busy: false,
    onFinish: () => {},
  },
  decorators: [phone],
} satisfies Meta<typeof GoalsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Straight after the placement test: the default goal, nothing else picked. */
export const Fresh: Story = {};

/** Interests chosen. Picked chips are outlined and tinted. */
export const WithInterests: Story = {
  args: { initialGoal: 30, initialInterests: ['Science', 'History', 'Nature'] },
};

/** Picking a different goal and an interest. */
export const Choosing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('20 / day'));
    await userEvent.click(canvas.getByText('Literature'));
    await expect(canvas.getByText('20 / day')).toBeInTheDocument();
  },
};

/** No placement estimate, so the footer falls back to generic copy. */
export const NoLevelEstimate: Story = {
  args: { levelEstimate: null },
};

/** Saving: the button spins while the profile is written. */
export const Saving: Story = {
  args: { busy: true },
};

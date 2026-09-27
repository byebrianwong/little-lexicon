import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
import { phone } from '@/stories/decorators';
import { CREDITS, NEW_PROFILE, profile } from '@/stories/fixtures';
import { SettingsLoading, SettingsView } from './SettingsView';

const meta = {
  title: 'Screens/Settings',
  component: SettingsView,
  args: {
    profile: profile(),
    soundEnabled: true,
    showDemoNote: false,
    credits: CREDITS,
    onSaveName: () => {},
    onSelectGoal: () => {},
    onSelectRetention: () => {},
    onToggleSound: () => {},
    onSelectReminder: () => {},
    onExport: () => {},
    onSignOut: () => {},
    onDeleteAccount: () => {},
  },
  decorators: [phone],
} satisfies Meta<typeof SettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A typical account: chips mark the current choices. */
export const FreeAccount: Story = {};

/** Sound off and no reminder set, so "Off" is the selected reminder chip. */
export const FeedbackAndRemindersOff: Story = {
  args: { soundEnabled: false, profile: profile({ reminderHour: null }) },
};

/** A fresh account with no name typed yet. */
export const NoDisplayName: Story = {
  args: { profile: NEW_PROFILE },
};

/** Demo builds add a line about where the data lives. */
export const DemoMode: Story = {
  args: { showDemoNote: true },
};

/** Typing a new name. Save stays available; the chip rows do not move. */
export const EditingName: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByPlaceholderText('Your name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Grace');
    await expect(input).toHaveValue('Grace');
  },
};

/** Before the profile arrives. */
export const Loading: StoryObj = {
  render: () => <SettingsLoading />,
  decorators: [phone],
};

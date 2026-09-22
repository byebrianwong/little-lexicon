import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
import { phone } from '@/stories/decorators';
import { NEW_PROFILE, PRO_PROFILE, profile } from '@/stories/fixtures';
import { SettingsLoading, SettingsView } from './SettingsView';

const meta = {
  title: 'Screens/Settings',
  component: SettingsView,
  args: {
    profile: profile(),
    soundEnabled: true,
    showDemoNote: false,
    onSaveName: () => {},
    onSelectGoal: () => {},
    onSelectRetention: () => {},
    onToggleSound: () => {},
    onSelectReminder: () => {},
    onUpgrade: () => {},
    onExport: () => {},
    onSignOut: () => {},
    onDeleteAccount: () => {},
  },
  decorators: [phone],
} satisfies Meta<typeof SettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A free account: the upgrade button shows, chips mark the current choices. */
export const FreeAccount: Story = {};

/** Pro: the membership row turns gold and the upgrade button disappears. */
export const ProAccount: Story = {
  args: { profile: PRO_PROFILE },
};

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

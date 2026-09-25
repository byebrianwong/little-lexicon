import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { Button } from './ui';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: {
    title: 'Continue',
    variant: 'primary',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger'],
    },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <View style={{ width: 320 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { variant: 'secondary', title: 'Maybe later' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', title: 'Skip' },
};

export const Danger: Story = {
  args: { variant: 'danger', title: 'Delete account' },
};

// A button that leads somewhere: the title moves to the left edge and an
// arrow sits at the right, as on "Got it, quiz me".
export const WithArrow: Story = {
  args: { title: 'Start learning', trailingIcon: 'arrow-right' },
};

export const Loading: Story = {
  args: { loading: true },
};

export const Disabled: Story = {
  args: { disabled: true, title: 'Not yet' },
};

// One snapshot covering every variant. Chromatic diffs this single image
// instead of five, and a palette change shows up in one place.
export const AllVariants: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <Button title="Primary" variant="primary" />
      <Button title="Secondary" variant="secondary" />
      <Button title="Ghost" variant="ghost" />
      <Button title="Danger" variant="danger" />
      <Button title="With arrow" variant="primary" trailingIcon="arrow-right" />
      <Button title="Disabled" variant="primary" disabled />
      <Button title="Loading" variant="primary" loading />
    </View>
  ),
};

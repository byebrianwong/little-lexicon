import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { OptionButton } from './OptionButton';

const meta = {
  title: 'Games/OptionButton',
  component: OptionButton,
  args: {
    label: 'lasting a very short time',
    state: 'idle',
    onPress: () => {},
  },
  argTypes: {
    state: {
      control: 'select',
      options: ['idle', 'correct', 'wrong', 'muted'],
    },
  },
  decorators: [
    (Story) => (
      <View style={{ width: 340 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof OptionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Correct: Story = {
  args: { state: 'correct' },
};

export const Wrong: Story = {
  args: { state: 'wrong' },
};

export const Muted: Story = {
  args: { state: 'muted' },
};

// What a multiple-choice question looks like right after a wrong answer:
// the chosen option is red, the right one green, the rest dimmed.
export const AnsweredIncorrectly: Story = {
  render: () => (
    <View>
      <OptionButton label="lasting a very short time" state="correct" onPress={() => {}} />
      <OptionButton label="happening once a year" state="wrong" onPress={() => {}} />
      <OptionButton label="impossible to describe" state="muted" onPress={() => {}} />
      <OptionButton label="full of sudden changes" state="muted" onPress={() => {}} />
    </View>
  ),
};

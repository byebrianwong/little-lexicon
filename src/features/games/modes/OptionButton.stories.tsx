import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { OptionButton, OptionList } from './OptionButton';

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
// the right option ticked, the chosen one crossed out, the rest dimmed.
export const AnsweredIncorrectly: Story = {
  render: () => (
    <OptionList>
      <OptionButton
        index={0}
        label="lasting a very short time"
        state="correct"
        onPress={() => {}}
      />
      <OptionButton
        index={1}
        label="happening once a year"
        state="wrong"
        onPress={() => {}}
      />
      <OptionButton
        index={2}
        label="impossible to describe"
        state="muted"
        onPress={() => {}}
      />
      <OptionButton
        index={3}
        label="full of sudden changes"
        state="muted"
        onPress={() => {}}
      />
    </OptionList>
  ),
};

// Definitions are not all short. This is the wrapping case, which the fixed
// row height in the other stories never shows.
export const LongLabel: Story = {
  args: {
    label:
      'occurring at irregular intervals and without any discernible pattern, ' +
      'especially in a way that frustrates prediction',
  },
};

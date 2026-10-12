import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { expect, userEvent, within } from 'storybook/test';
import { ReportProblem, ReportProblemView } from './ReportProblem';

const noop = () => {};

const meta = {
  title: 'Components/ReportProblem',
  component: ReportProblemView,
  args: {
    headword: 'quixotic',
    status: 'open',
    reason: null,
    note: '',
    onOpen: noop,
    onCancel: noop,
    onReason: noop,
    onNote: noop,
    onSend: noop,
  },
  decorators: [
    (Story) => (
      <View style={{ width: 350 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof ReportProblemView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** How it sits under a word before anyone taps it. */
export const Closed: Story = {
  args: { status: 'closed' },
};

/** Open, before a reason is picked. Sending is off until one is. */
export const Open: Story = {};

/** A reason picked and a note typed. */
export const Filled: Story = {
  args: {
    reason: 'pronunciation',
    note: 'The stress should be on the second syllable.',
  },
};

export const Sending: Story = {
  args: { status: 'sending', reason: 'example' },
};

export const Failed: Story = {
  args: { status: 'error', reason: 'definition' },
};

export const Sent: Story = {
  args: { status: 'sent' },
};

/** The whole flow against the demo backend: open, pick, send. */
export const SendsAReport: Story = {
  render: () => <ReportProblem wordId={1} headword="abate" screen="browse" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Report a problem'));
    await userEvent.click(canvas.getByText('Example sentence'));
    await userEvent.click(canvas.getByText('Send report'));
    await expect(await canvas.findByText('Thanks. We will check this word.')).toBeInTheDocument();
  },
};

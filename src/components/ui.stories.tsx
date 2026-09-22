import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import {
  Body,
  Card,
  Divider,
  H1,
  H2,
  Muted,
  Pill,
  ProgressBar,
  Row,
  Spacer,
} from './ui';

// A catalog meta: these primitives are small enough that one story per
// component would be noise. Each story below is one Chromatic snapshot.
const meta = {
  title: 'UI/Primitives',
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

export const Typography: Story = {
  render: () => (
    <View style={{ gap: 8 }}>
      <H1>Little Lexicon</H1>
      <H2>Your session</H2>
      <Body>A word you have seen twice before.</Body>
      <Muted>Due in 3 days</Muted>
    </View>
  ),
};

export const Pills: Story = {
  render: () => (
    <View style={{ gap: 8, alignItems: 'flex-start' }}>
      <Pill>Neutral</Pill>
      <Pill tone="primary">New</Pill>
      <Pill tone="success">Learned</Pill>
      <Pill tone="danger">Missed</Pill>
      <Pill tone="gold">Streak</Pill>
    </View>
  ),
};

export const Cards: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <Card>
        <H2>ephemeral</H2>
        <Spacer h={4} />
        <Muted>adjective</Muted>
        <Spacer h={8} />
        <Body>Lasting for a very short time.</Body>
      </Card>
      <Card>
        <Row className="gap-2">
          <Pill tone="gold">7 day streak</Pill>
          <Pill tone="primary">12 words</Pill>
        </Row>
        <Divider />
        <Body>Keep going to reach 10.</Body>
      </Card>
    </View>
  ),
};

export const Progress: Story = {
  render: () => (
    <View style={{ gap: 12 }}>
      <Muted>Empty</Muted>
      <ProgressBar fraction={0} />
      <Muted>Part way</Muted>
      <ProgressBar fraction={0.35} />
      <Muted>Nearly done</Muted>
      <ProgressBar fraction={0.9} />
      <Muted>Complete</Muted>
      <ProgressBar fraction={1} />
      <Muted>Out of range values are clamped</Muted>
      <ProgressBar fraction={1.8} />
    </View>
  ),
};

export const Layout: Story = {
  render: () => (
    <View>
      <Row className="gap-2">
        <Pill tone="primary">Row</Pill>
        <Muted>items sit on one line</Muted>
      </Row>
      <Divider />
      <Body>Divider above, spacer below.</Body>
      <Spacer h={32} />
      <Body>32 points lower.</Body>
    </View>
  ),
};

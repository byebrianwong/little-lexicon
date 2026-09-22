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
  Screen,
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
      {(
        [
          ['Empty', 0],
          ['Part way', 0.35],
          ['Nearly done', 0.9],
          ['Complete', 1],
          ['Out of range values are clamped', 1.8],
        ] as const
      ).map(([label, fraction]) => (
        <View key={label} style={{ gap: 6 }}>
          <Row className="justify-between">
            <Muted>{label}</Muted>
            <Muted>{Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%</Muted>
          </Row>
          <ProgressBar fraction={fraction} />
        </View>
      ))}
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

// The screen chrome itself: safe-area padding and the page background, which
// nothing else in this file exercises.
export const ScreenChrome: Story = {
  decorators: [
    (Story) => (
      <View style={{ width: 340, height: 420 }}>
        <Story />
      </View>
    ),
  ],
  render: () => (
    <Screen>
      <Spacer h={16} />
      <H1>Session complete</H1>
      <Spacer h={8} />
      <Muted>12 words reviewed</Muted>
      <Divider />
      <Body>The screen supplies the background and the safe-area inset.</Body>
    </Screen>
  ),
};

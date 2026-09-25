import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { Icon, type IconName } from './Icon';
import {
  Body,
  Choice,
  ChoiceGroup,
  Divider,
  H1,
  H2,
  Headword,
  Label,
  ListRow,
  Muted,
  Note,
  ProgressBar,
  Row,
  Screen,
  Section,
  Spacer,
  Stat,
  TextButton,
  TextField,
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

const noop = () => {};

export const Typography: Story = {
  render: () => (
    <View style={{ gap: 10 }}>
      <Label>Label, in small capitals</Label>
      <H1>Little Lexicon</H1>
      <H2>Your session</H2>
      <Headword>ephemeral</Headword>
      <Body>A word you have seen twice before.</Body>
      <Muted>Due in 3 days</Muted>
      <Note>“Fame in the age of the internet is ephemeral.”</Note>
      <Row className="gap-4">
        <Label tone="ink">Ink</Label>
        <Label tone="accent">Accent</Label>
      </Row>
    </View>
  ),
};

// Sections replace cards: an ink rule, a label, then the content. A hairline
// section sits inside another as an aside.
export const Sections: Story = {
  render: () => (
    <View style={{ gap: 28 }}>
      <Section label="Today" trailing="7 of 15">
        <Body>Eight more to keep your streak.</Body>
      </Section>
      <Section label="Memory hook" rule="hairline">
        <Body>Ephemera are the scraps of paper meant to be thrown away.</Body>
      </Section>
      <Section label="Words">
        <Row className="items-start gap-4">
          <Stat value={9} label="Due now" />
          <Stat value={24} label="Learning" />
          <Stat value={112} label="Known" />
        </Row>
      </Section>
    </View>
  ),
};

export const Rows: Story = {
  render: () => (
    <View>
      <ListRow title="Start session" emphasis showArrow onPress={noop} />
      <ListRow title="Endless practice" detail="no timer" onPress={noop} />
      <ListRow title="Delete account" tone="accent" onPress={noop} last />
    </View>
  ),
};

export const Controls: Story = {
  render: () => (
    <View style={{ gap: 20 }}>
      <ChoiceGroup>
        <Choice label="10" selected={false} onPress={noop} />
        <Choice label="15" selected onPress={noop} />
        <Choice label="20" selected={false} onPress={noop} />
      </ChoiceGroup>
      <TextField placeholder="Type the word" accessibilityLabel="Answer" />
      <TextField
        variant="box"
        multiline
        placeholder="Write a sentence"
        accessibilityLabel="Sentence"
      />
      <TextButton icon="speaker" label="Hear it" onPress={noop} />
    </View>
  ),
};

const ICONS: IconName[] = [
  'arrow-right',
  'arrow-left',
  'close',
  'check',
  'cross',
  'speaker',
  'chevron-down',
  'chevron-up',
  'search',
];

export const Icons: Story = {
  render: () => (
    <Row className="flex-wrap gap-5">
      {ICONS.map((name) => (
        <View key={name} style={{ alignItems: 'center', gap: 4, width: 64 }}>
          <Icon name={name} size={24} />
          <Muted className="text-[12px] leading-[16px]">{name}</Muted>
        </View>
      ))}
    </Row>
  ),
};

export const Progress: Story = {
  render: () => (
    <View style={{ gap: 14 }}>
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
            <Muted>{`${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`}</Muted>
          </Row>
          <ProgressBar fraction={fraction} />
        </View>
      ))}
      <View style={{ gap: 6 }}>
        <Muted>Accent, for the speed round clock</Muted>
        <ProgressBar fraction={0.4} tone="accent" />
      </View>
    </View>
  ),
};

export const Layout: Story = {
  render: () => (
    <View>
      <Row className="gap-2">
        <Label tone="ink">Row</Label>
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

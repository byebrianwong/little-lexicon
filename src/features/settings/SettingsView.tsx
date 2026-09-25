// The settings screen's layout. Every action is a prop, so the screen keeps the
// mutations, the permission prompts and the confirm dialogs.
//
// The view takes a loaded profile, never undefined: the display-name box seeds
// its text from the profile on mount, so mounting it before the profile arrives
// would leave the box empty for good.

import { useState } from 'react';
import { Platform, Switch, View } from 'react-native';
import {
  Body,
  Button,
  CenterScreen,
  Choice,
  ChoiceGroup,
  H1,
  Label,
  ListRow,
  Muted,
  Note,
  Row,
  Screen,
  Section,
  TextField,
} from '@/components/ui';
import { colors } from '@/theme/colors';
import type { Profile } from '@/lib/types';

const GOALS = [10, 15, 20, 30];

// React Native Web colours an "on" switch's thumb with its own teal unless
// told otherwise, through a prop the native Switch types do not list.
const webSwitchProps = Platform.OS === 'web' ? { activeThumbColor: colors.paper } : {};
const RETENTIONS = [0.8, 0.85, 0.9, 0.95];
const REMINDER_HOURS = [8, 12, 18, 21];

export interface SettingsViewProps {
  profile: Profile;
  soundEnabled: boolean;
  onSaveName: (name: string | null) => void;
  onSelectGoal: (goal: number) => void;
  onSelectRetention: (retention: number) => void;
  onToggleSound: (enabled: boolean) => void;
  /** null turns the daily reminder off. */
  onSelectReminder: (hour: number | null) => void;
  onUpgrade: () => void;
  onExport: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  /** Demo mode stores everything on the device; the screen says so. */
  showDemoNote: boolean;
}

export function SettingsView({
  profile,
  soundEnabled,
  onSaveName,
  onSelectGoal,
  onSelectRetention,
  onToggleSound,
  onSelectReminder,
  onUpgrade,
  onExport,
  onSignOut,
  onDeleteAccount,
  showDemoNote,
}: SettingsViewProps) {
  const [name, setName] = useState(profile.displayName ?? '');

  return (
    <Screen scroll edges={['top']}>
      <H1 className="pt-4">Settings</H1>

      <Section label="Profile" className="mt-8">
        <Muted>Display name</Muted>
        <Row className="items-end gap-4">
          <TextField
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            accessibilityLabel="Display name"
            className="flex-1"
          />
          <Button
            title="Save"
            variant="secondary"
            className="min-h-[44px]"
            onPress={() => onSaveName(name.trim() || null)}
          />
        </Row>
        <Row className="mt-6 justify-between">
          <Body>Membership</Body>
          {profile.isPro ? <Label tone="accent">Pro</Label> : <Note>Free</Note>}
        </Row>
        {!profile.isPro ? (
          <View className="mt-4">
            <Button
              title="Upgrade to Pro"
              variant="secondary"
              trailingIcon="arrow-right"
              onPress={onUpgrade}
            />
          </View>
        ) : null}
      </Section>

      <Section label="Daily goal" className="mt-10">
        <Muted>Reviews and new words per day.</Muted>
        <ChoiceGroup className="mt-3">
          {GOALS.map((g) => (
            <Choice
              key={g}
              label={`${g}`}
              selected={profile.dailyGoal === g}
              onPress={() => onSelectGoal(g)}
            />
          ))}
        </ChoiceGroup>
      </Section>

      <Section label="Desired retention" className="mt-10">
        <Muted>
          Higher retention means more reviews but stronger recall. Lower means fewer
          reviews.
        </Muted>
        <ChoiceGroup className="mt-3">
          {RETENTIONS.map((r) => (
            <Choice
              key={r}
              label={`${Math.round(r * 100)}%`}
              selected={profile.desiredRetention === r}
              onPress={() => onSelectRetention(r)}
            />
          ))}
        </ChoiceGroup>
      </Section>

      <Section label="Sound and haptics" className="mt-10">
        <Row className="justify-between gap-4">
          <Muted className="flex-1">Feedback on correct answers.</Muted>
          {/* The label above it is not attached to the control, so the
              switch needs its own name. */}
          <Switch
            value={soundEnabled}
            onValueChange={onToggleSound}
            accessibilityLabel="Sound and haptics"
            trackColor={{ false: colors.rule, true: colors.ink }}
            thumbColor={colors.paper}
            ios_backgroundColor={colors.rule}
            {...webSwitchProps}
          />
        </Row>
      </Section>

      <Section label="Daily reminder" className="mt-10">
        <Muted>A gentle local nudge to keep your streak.</Muted>
        <ChoiceGroup className="mt-3">
          <Choice
            label="Off"
            selected={profile.reminderHour === null}
            onPress={() => onSelectReminder(null)}
          />
          {REMINDER_HOURS.map((h) => (
            <Choice
              key={h}
              label={`${h}:00`}
              selected={profile.reminderHour === h}
              onPress={() => onSelectReminder(h)}
            />
          ))}
        </ChoiceGroup>
      </Section>

      <Section label="Account" className="mt-10">
        <ListRow title="Export my data" onPress={onExport} />
        <ListRow title="Sign out" onPress={onSignOut} />
        <ListRow title="Delete account" tone="accent" onPress={onDeleteAccount} last />
      </Section>

      {showDemoNote ? (
        <Note className="mt-8 text-center">
          Demo mode: data is stored only on this device.
        </Note>
      ) : null}
    </Screen>
  );
}

/** Shown until the profile arrives. */
export function SettingsLoading() {
  return (
    <CenterScreen>
      <Muted>Loading…</Muted>
    </CenterScreen>
  );
}

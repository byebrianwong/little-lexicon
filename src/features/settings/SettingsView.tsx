// The settings screen's layout. Every action is a prop, so the screen keeps the
// mutations, the permission prompts and the confirm dialogs.
//
// The view takes a loaded profile, never undefined: the display-name box seeds
// its text from the profile on mount, so mounting it before the profile arrives
// would leave the box empty for good.

import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Card, Divider, H1, H2, Muted, Row } from '@/components/ui';
import type { Profile } from '@/lib/types';

const GOALS = [10, 15, 20, 30];
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
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <H1>Settings</H1>

        {/* Profile */}
        <Card className="mt-5">
          <H2>Profile</H2>
          <Muted className="mt-1">Display name</Muted>
          <Row className="mt-2 gap-3">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#6B7699"
              className="flex-1 rounded-2xl border border-border bg-surface px-4 py-3 text-text"
            />
            <Button title="Save" onPress={() => onSaveName(name.trim() || null)} />
          </Row>
          <Divider />
          <Row className="justify-between">
            <Body>Membership</Body>
            <Body className={profile.isPro ? 'text-gold font-semibold' : 'text-muted'}>
              {profile.isPro ? 'Pro' : 'Free'}
            </Body>
          </Row>
          {!profile.isPro ? (
            <View className="mt-3">
              <Button title="Upgrade to Pro" variant="secondary" onPress={onUpgrade} />
            </View>
          ) : null}
        </Card>

        {/* Daily goal */}
        <Card className="mt-4">
          <H2>Daily goal</H2>
          <Muted className="mt-1">Reviews and new words per day.</Muted>
          <ChipRow
            options={GOALS.map((g) => ({ label: `${g}`, value: g }))}
            selected={profile.dailyGoal}
            onSelect={onSelectGoal}
          />
        </Card>

        {/* Desired retention */}
        <Card className="mt-4">
          <H2>Desired retention</H2>
          <Muted className="mt-1">
            Higher retention means more reviews but stronger recall. Lower means fewer reviews.
          </Muted>
          <ChipRow
            options={RETENTIONS.map((r) => ({ label: `${Math.round(r * 100)}%`, value: r }))}
            selected={profile.desiredRetention}
            onSelect={onSelectRetention}
          />
        </Card>

        {/* Feedback */}
        <Card className="mt-4">
          <Row className="justify-between">
            <View className="flex-1 pr-4">
              <H2>Sound and haptics</H2>
              <Muted className="mt-1">Feedback on correct answers.</Muted>
            </View>
            {/* The heading beside it is not attached to the control, so the
                switch needs its own name. */}
            <Switch
              value={soundEnabled}
              onValueChange={onToggleSound}
              accessibilityLabel="Sound and haptics"
            />
          </Row>
        </Card>

        {/* Reminders */}
        <Card className="mt-4">
          <H2>Daily reminder</H2>
          <Muted className="mt-1">A gentle local nudge to keep your streak.</Muted>
          <ChipRow
            options={[
              { label: 'Off', value: -1 },
              ...REMINDER_HOURS.map((h) => ({ label: `${h}:00`, value: h })),
            ]}
            selected={profile.reminderHour ?? -1}
            onSelect={(h) => onSelectReminder(h === -1 ? null : h)}
          />
        </Card>

        {/* Account */}
        <Card className="mt-4">
          <H2>Account</H2>
          <View className="mt-3 gap-3">
            <Button title="Export my data" variant="secondary" onPress={onExport} />
            <Button title="Sign out" variant="secondary" onPress={onSignOut} />
            <Button title="Delete account" variant="danger" onPress={onDeleteAccount} />
          </View>
        </Card>

        {showDemoNote ? (
          <Muted className="mt-4 text-center">
            Demo mode: data is stored only on this device.
          </Muted>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Shown until the profile arrives. */
export function SettingsLoading() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="flex-1 items-center justify-center">
        <Muted>Loading…</Muted>
      </View>
    </SafeAreaView>
  );
}

function ChipRow<T extends number>({
  options,
  selected,
  onSelect,
}: {
  options: { label: string; value: T }[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  return (
    <View className="mt-3 flex-row flex-wrap gap-3">
      {options.map((o) => {
        const active = o.value === selected;
        return (
          <Pressable
            key={o.label}
            onPress={() => onSelect(o.value)}
            // A chip is a button, and which one is on matters. Without these a
            // screen reader reads five numbers and no way to tell them apart.
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`rounded-full border px-4 py-2 ${
              active ? 'border-primary bg-primary/20' : 'border-border bg-surface'
            }`}
          >
            <Text className={`text-sm font-medium ${active ? 'text-primary' : 'text-text'}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

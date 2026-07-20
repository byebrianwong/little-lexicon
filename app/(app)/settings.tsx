import { useState } from 'react';
import { Alert, Pressable, Share, Switch, Text, TextInput, View , ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Card, Divider, H1, H2, Muted, Row } from '@/components/ui';
import { useProfile, useUpdateProfile } from '@/features/review/queries';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { useAuthStore } from '@/features/auth/authStore';
import { backend } from '@/lib/backend';
import { isDemoMode } from '@/lib/env';
import { scheduleDailyReminder, cancelDailyReminder } from '@/lib/notifications';

const GOALS = [10, 15, 20, 30];
const RETENTIONS = [0.8, 0.85, 0.9, 0.95];
const REMINDER_HOURS = [8, 12, 18, 21];

export default function Settings() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const signOut = useAuthStore((s) => s.signOut);
  const p = profile.data;

  const [name, setName] = useState(p?.displayName ?? '');

  if (!p) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <Muted>Loading…</Muted>
        </View>
      </SafeAreaView>
    );
  }

  async function setReminder(hour: number | null) {
    if (hour === null) {
      await cancelDailyReminder();
      update.mutate({ reminderHour: null });
      return;
    }
    const ok = await scheduleDailyReminder(hour);
    if (!ok) {
      Alert.alert('Reminders off', 'Enable notifications for this app to get daily reminders.');
      return;
    }
    update.mutate({ reminderHour: hour });
  }

  async function exportData() {
    try {
      const data = await backend.exportData();
      const json = JSON.stringify(data, null, 2);
      await Share.share({ message: json, title: 'My Little Lexicon data' });
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all your progress. Content is unaffected. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await backend.deleteAccount();
              router.replace('/(auth)/sign-in');
            } catch (e) {
              Alert.alert('Deletion failed', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ],
    );
  }

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
            <Button
              title="Save"
              onPress={() => update.mutate({ displayName: name.trim() || null })}
            />
          </Row>
          <Divider />
          <Row className="justify-between">
            <Body>Membership</Body>
            <Body className={p.isPro ? 'text-gold font-semibold' : 'text-muted'}>
              {p.isPro ? 'Pro' : 'Free'}
            </Body>
          </Row>
          {!p.isPro ? (
            <View className="mt-3">
              <Button title="Upgrade to Pro" variant="secondary" onPress={() => router.push('/paywall')} />
            </View>
          ) : null}
        </Card>

        {/* Daily goal */}
        <Card className="mt-4">
          <H2>Daily goal</H2>
          <Muted className="mt-1">Reviews and new words per day.</Muted>
          <ChipRow
            options={GOALS.map((g) => ({ label: `${g}`, value: g }))}
            selected={p.dailyGoal}
            onSelect={(g) => update.mutate({ dailyGoal: g })}
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
            selected={p.desiredRetention}
            onSelect={(r) => update.mutate({ desiredRetention: r })}
          />
        </Card>

        {/* Feedback */}
        <Card className="mt-4">
          <Row className="justify-between">
            <View className="flex-1 pr-4">
              <H2>Sound and haptics</H2>
              <Muted className="mt-1">Feedback on correct answers.</Muted>
            </View>
            <Switch value={soundEnabled} onValueChange={setSoundEnabled} />
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
            selected={p.reminderHour ?? -1}
            onSelect={(h) => setReminder(h === -1 ? null : h)}
          />
        </Card>

        {/* Account */}
        <Card className="mt-4">
          <H2>Account</H2>
          <View className="mt-3 gap-3">
            <Button title="Export my data" variant="secondary" onPress={exportData} />
            <Button title="Sign out" variant="secondary" onPress={() => signOut()} />
            <Button title="Delete account" variant="danger" onPress={confirmDelete} />
          </View>
        </Card>

        {isDemoMode ? (
          <Muted className="mt-4 text-center">
            Demo mode: data is stored only on this device.
          </Muted>
        ) : null}
      </ScrollView>
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

import { Alert, Share } from 'react-native';
import { router } from 'expo-router';
import { useProfile, useUpdateProfile } from '@/features/review/queries';
import { SettingsLoading, SettingsView } from '@/features/settings/SettingsView';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { useAuthStore } from '@/features/auth/authStore';
import { backend } from '@/lib/backend';
import { isDemoMode } from '@/lib/env';
import { pushOnce } from '@/lib/navigation';
import { scheduleDailyReminder, cancelDailyReminder } from '@/lib/notifications';

export default function Settings() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const signOut = useAuthStore((s) => s.signOut);
  const p = profile.data;

  if (!p) return <SettingsLoading />;

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
    <SettingsView
      profile={p}
      soundEnabled={soundEnabled}
      onSaveName={(displayName) => update.mutate({ displayName })}
      onSelectGoal={(dailyGoal) => update.mutate({ dailyGoal })}
      onSelectRetention={(desiredRetention) => update.mutate({ desiredRetention })}
      onToggleSound={setSoundEnabled}
      onSelectReminder={setReminder}
      onUpgrade={() => pushOnce('/paywall')}
      onExport={exportData}
      onSignOut={() => signOut()}
      onDeleteAccount={confirmDelete}
      showDemoNote={isDemoMode}
    />
  );
}

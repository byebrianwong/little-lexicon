import { Share } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useProfile, useUpdateProfile } from '@/features/review/queries';
import { SettingsLoading, SettingsView } from '@/features/settings/SettingsView';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { useAuthStore } from '@/features/auth/authStore';
import { backend } from '@/lib/backend';
import { loadContent } from '@/lib/content';
import { confirmDestructive, showMessage } from '@/lib/dialogs';
import { isDemoMode } from '@/lib/env';
import { scheduleDailyReminder, cancelDailyReminder } from '@/lib/notifications';

export default function Settings() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const signOut = useAuthStore((s) => s.signOut);
  const credits = useQuery({
    queryKey: ['contentCredits'],
    queryFn: async () => (await loadContent()).attribution,
  });
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
      showMessage('Reminders off', 'Enable notifications for this app to get daily reminders.');
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
      showMessage('Export failed', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  function confirmDelete() {
    confirmDestructive({
      title: 'Delete account',
      message:
        'This permanently deletes all your Little Lexicon progress and signs you out. This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await backend.deleteAccount();
          router.replace('/(auth)/sign-in');
        } catch (e) {
          showMessage('Deletion failed', e instanceof Error ? e.message : 'Please try again.');
        }
      },
    });
  }

  return (
    <SettingsView
      profile={p}
      soundEnabled={soundEnabled}
      onSaveName={(displayName) => update.mutate({ displayName })}
      onSelectGoal={(dailyGoal) => update.mutate({ dailyGoal })}
      onSelectLevel={(levelEstimate) => update.mutate({ levelEstimate })}
      onSelectRetention={(desiredRetention) => update.mutate({ desiredRetention })}
      onSelectKnownFrequency={(knownWordFrequency) => update.mutate({ knownWordFrequency })}
      onToggleSound={setSoundEnabled}
      onSelectReminder={setReminder}
      onExport={exportData}
      onSignOut={() => signOut()}
      onDeleteAccount={confirmDelete}
      showDemoNote={isDemoMode}
      credits={credits.data ?? []}
    />
  );
}

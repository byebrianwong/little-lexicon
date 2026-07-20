// Opt-in daily reminders (Phase 6.3). Local notifications only; no push server.
// Respects permission state and a user setting. All calls degrade quietly when
// permission is denied or the platform is web.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const REMINDER_ID = 'little-lexicon-daily-reminder';

export async function requestPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/**
 * Schedule (or reschedule) a daily reminder at the given local hour. Cancels
 * any prior reminder first so there is never a duplicate. Returns false if
 * permission is missing.
 */
export async function scheduleDailyReminder(hour: number): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const granted = await requestPermission();
  if (!granted) return false;

  await cancelDailyReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'Time for your words',
      body: 'A few minutes keeps your streak alive and your reviews on schedule.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: Math.min(23, Math.max(0, Math.floor(hour))),
      minute: 0,
    },
  });
  return true;
}

export async function cancelDailyReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    // Not scheduled; ignore.
  }
}

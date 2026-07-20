// Immediate feedback for answers (Phase 5.5). Haptic cue on native, gated by the
// user's sound/feedback setting. Web degrades to no-op. Never blocks the UI.

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export function feedbackCorrect(enabled: boolean): void {
  if (!enabled || Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function feedbackIncorrect(enabled: boolean): void {
  if (!enabled || Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

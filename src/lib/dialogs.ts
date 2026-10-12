// Messages and confirmations that work on every platform.
//
// React Native's Alert.alert does nothing on web: react-native-web leaves it
// as an empty function. So a confirmation built on it never appears there,
// and the action behind it can never run. On web these use the browser's own
// alert and confirm instead.

import { Alert, Platform } from 'react-native';

export function showMessage(title: string, message: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function confirmDestructive(options: {
  title: string;
  message: string;
  /** The label of the button that goes ahead, such as "Delete". */
  confirmLabel: string;
  onConfirm: () => void;
}): void {
  const { title, message, confirmLabel, onConfirm } = options;
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

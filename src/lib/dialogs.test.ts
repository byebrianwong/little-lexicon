import { Alert, Platform } from 'react-native';
import { confirmDestructive, showMessage } from './dialogs';

describe('dialogs', () => {
  const originalOS = Platform.OS;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    Platform.OS = originalOS;
    alertSpy.mockRestore();
    Reflect.deleteProperty(globalThis, 'confirm');
    Reflect.deleteProperty(globalThis, 'alert');
  });

  it('asks with the browser on web, because Alert.alert does nothing there', () => {
    Platform.OS = 'web';
    const confirm = jest.fn(() => true);
    Object.defineProperty(globalThis, 'confirm', { value: confirm, configurable: true });
    const onConfirm = jest.fn();

    confirmDestructive({ title: 'Delete account', message: 'Sure?', confirmLabel: 'Delete', onConfirm });

    expect(confirm).toHaveBeenCalledWith('Delete account\n\nSure?');
    expect(onConfirm).toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does nothing on web when the person cancels', () => {
    Platform.OS = 'web';
    Object.defineProperty(globalThis, 'confirm', { value: () => false, configurable: true });
    const onConfirm = jest.fn();
    confirmDestructive({ title: 'Delete account', message: 'Sure?', confirmLabel: 'Delete', onConfirm });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('uses Alert with Cancel and a destructive button on phones', () => {
    Platform.OS = 'ios';
    const onConfirm = jest.fn();
    confirmDestructive({ title: 'Delete account', message: 'Sure?', confirmLabel: 'Delete', onConfirm });

    const [title, message, buttons] = alertSpy.mock.calls[0] as [
      string,
      string,
      { text: string; style: string; onPress?: () => void }[],
    ];
    expect([title, message]).toEqual(['Delete account', 'Sure?']);
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Delete', 'destructive'],
    ]);
    buttons[1]!.onPress!();
    expect(onConfirm).toHaveBeenCalled();
  });

  it('shows messages with the browser on web and Alert on phones', () => {
    Platform.OS = 'web';
    const alert = jest.fn();
    Object.defineProperty(globalThis, 'alert', { value: alert, configurable: true });
    showMessage('Export failed', 'Try again.');
    expect(alert).toHaveBeenCalledWith('Export failed\n\nTry again.');

    Platform.OS = 'android';
    showMessage('Export failed', 'Try again.');
    expect(alertSpy).toHaveBeenCalledWith('Export failed', 'Try again.');
  });
});

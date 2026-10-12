import { Platform } from 'react-native';
import { authRedirectUrl, WEB_APP_URL } from './authRedirect';

describe('authRedirectUrl', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
    Reflect.deleteProperty(globalThis, 'location');
  });

  it('sends native sign-ups to the web app, never the shared Site URL', () => {
    Platform.OS = 'ios';
    expect(authRedirectUrl()).toBe(WEB_APP_URL);
  });

  it('brings web sign-ups back to the site they came from', () => {
    Platform.OS = 'web';
    Object.defineProperty(globalThis, 'location', {
      value: { origin: 'http://localhost:8081' },
      configurable: true,
    });
    expect(authRedirectUrl()).toBe('http://localhost:8081/');
  });

  it('falls back to the web app when web has no location', () => {
    Platform.OS = 'web';
    expect(authRedirectUrl()).toBe(WEB_APP_URL);
  });
});

import { shouldCheckForUpdate } from './updates';

describe('shouldCheckForUpdate', () => {
  it('checks in a release build where updates are configured', () => {
    expect(shouldCheckForUpdate({ isDev: false, isEnabled: true })).toBe(true);
  });

  it('skips in dev, where Metro serves the bundle', () => {
    expect(shouldCheckForUpdate({ isDev: true, isEnabled: true })).toBe(false);
  });

  it('skips when updates are not enabled (web, or a build without EAS Update)', () => {
    expect(shouldCheckForUpdate({ isDev: false, isEnabled: false })).toBe(false);
  });

  it('skips a dev build that also has updates disabled', () => {
    expect(shouldCheckForUpdate({ isDev: true, isEnabled: false })).toBe(false);
  });
});

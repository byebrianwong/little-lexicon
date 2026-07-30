import { PUSH_GUARD_MS, hrefKey, shouldAllowPush } from './navigation';

describe('shouldAllowPush', () => {
  it('allows the first push of a route', () => {
    expect(shouldAllowPush(undefined, 1_000)).toBe(true);
  });

  it('blocks a second push inside the guard window', () => {
    // The double-tap case: two taps a frame apart.
    expect(shouldAllowPush(1_000, 1_050)).toBe(false);
  });

  it('allows a push again once the window has passed', () => {
    expect(shouldAllowPush(1_000, 1_000 + PUSH_GUARD_MS)).toBe(true);
  });

  it('treats the boundary as allowed and just inside it as blocked', () => {
    expect(shouldAllowPush(0, PUSH_GUARD_MS - 1)).toBe(false);
    expect(shouldAllowPush(0, PUSH_GUARD_MS)).toBe(true);
  });

  it('honours a custom window', () => {
    expect(shouldAllowPush(0, 100, 200)).toBe(false);
    expect(shouldAllowPush(0, 200, 200)).toBe(true);
  });
});

describe('hrefKey', () => {
  it('uses a string href as its own key', () => {
    expect(hrefKey('/session')).toBe('/session');
  });

  it('distinguishes different routes', () => {
    expect(hrefKey('/session')).not.toBe(hrefKey('/speed'));
  });

  it('keys object hrefs by their contents', () => {
    const a = hrefKey({ pathname: '/paywall', params: { from: 'home' } });
    const b = hrefKey({ pathname: '/paywall', params: { from: 'home' } });
    expect(a).toBe(b);
    expect(a).not.toBe(hrefKey({ pathname: '/paywall', params: { from: 'settings' } }));
  });
});

// Guarded navigation.
//
// Expo Router's `push` appends a screen on every call, so two taps that land
// before the target route mounts open two copies of it. That is easy to hit on
// a real device: the tap target stays live while the session screen is still
// bundling, and the user gets a stacked duplicate they have to dismiss twice.
// `pushOnce` swallows a repeat push of the same route inside a short window.

import { router } from 'expo-router';

/** Href type of the installed router, derived so it tracks the version. */
type Href = Parameters<typeof router.push>[0];

/** Minimum gap between two accepted pushes of the same route. */
export const PUSH_GUARD_MS = 700;

/**
 * Pure guard: should a push of a route whose last accepted push was at
 * `lastPushAt` be allowed at `now`? Separated from the router for unit tests.
 */
export function shouldAllowPush(
  lastPushAt: number | undefined,
  now: number,
  guardMs: number = PUSH_GUARD_MS,
): boolean {
  return lastPushAt === undefined || now - lastPushAt >= guardMs;
}

/** Stable map key for an href, which may be a string or an object. */
export function hrefKey(href: Href): string {
  return typeof href === 'string' ? href : JSON.stringify(href);
}

const lastPushAt = new Map<string, number>();

/**
 * `router.push`, ignoring a rapid second tap on the same route. Returns whether
 * the navigation was performed.
 */
export function pushOnce(href: Href, now: number = Date.now()): boolean {
  const key = hrefKey(href);
  if (!shouldAllowPush(lastPushAt.get(key), now)) return false;
  lastPushAt.set(key, now);
  router.push(href);
  return true;
}

/** Clear recorded push times. For tests. */
export function resetPushGuard(): void {
  lastPushAt.clear();
}

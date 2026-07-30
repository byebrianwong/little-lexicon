// Over-the-air updates (EAS Update).
//
// The default expo-updates behaviour downloads a new bundle in the background
// and applies it on the NEXT launch, so an installed build is always one
// relaunch behind. This module checks on startup and reloads straight away, so
// a build picks up a published update the first time it is opened.
//
// Only JS and assets travel this way. A change to native code or native config
// moves the fingerprint runtimeVersion, and older builds correctly stop
// matching the new update until they are rebuilt and reinstalled.

import * as Updates from 'expo-updates';

export type UpdateResult =
  | 'disabled' // dev client, web, or a build without updates configured
  | 'none' // already on the newest bundle
  | 'failed' // could not reach the update server
  | 'reloading'; // a new bundle was fetched; the app is restarting

/**
 * Decide whether an update check is worth attempting. Split out from the I/O so
 * the conditions are unit testable.
 */
export function shouldCheckForUpdate(input: {
  isDev: boolean;
  isEnabled: boolean;
}): boolean {
  // In dev the bundle comes from Metro, and Updates.isEnabled is false on web
  // and in builds where updates were never configured.
  return !input.isDev && input.isEnabled;
}

/**
 * Check for a published update and, if there is one, fetch and apply it
 * immediately. Never throws: a failed check must not stop the app starting.
 */
export async function applyUpdateOnStartup(): Promise<UpdateResult> {
  if (!shouldCheckForUpdate({ isDev: __DEV__, isEnabled: Updates.isEnabled })) {
    return 'disabled';
  }
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return 'none';
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return 'reloading';
  } catch (e) {
    // Offline or the update server is unreachable. Keep the bundle we have and
    // log with context rather than swallowing it.
    console.warn('updates: could not apply update on startup', e);
    return 'failed';
  }
}

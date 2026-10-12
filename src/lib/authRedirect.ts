// Where Supabase sends someone after they open the confirmation link in their
// sign-up email.
//
// Without this, Supabase uses the project's Site URL. The games-apps project
// is shared with other apps, so that URL can belong to one of them. Whatever
// this returns must also be on the project's redirect allow list (Auth, URL
// Configuration), or Supabase falls back to the Site URL anyway.

import { Platform } from 'react-native';

export const WEB_APP_URL = 'https://littlelexicon.byebrianwong.com/';

export function authRedirectUrl(): string {
  // On web, come back to the same site, so a local or preview build works too.
  // supabase-js reads the session from the link there (detectSessionInUrl).
  const origin = Platform.OS === 'web' ? globalThis.location?.origin : undefined;
  if (origin) return `${origin}/`;
  // The native app does not handle the link yet. The address is confirmed as
  // soon as the link is opened, so the person can sign in to the app after.
  return WEB_APP_URL;
}

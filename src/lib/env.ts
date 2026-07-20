// Central, typed access to client-safe environment values.
// Only EXPO_PUBLIC_* is ever read here. Server secrets must never reach the bundle.

function readString(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  const v = readString(value).toLowerCase();
  if (v === '') return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

export const env = {
  supabaseUrl: readString(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: readString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  revenueCatIosKey: readString(process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY),
  revenueCatAndroidKey: readString(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY),
  revenueCatEnabled: readBool(process.env.EXPO_PUBLIC_REVENUECAT_ENABLED, false),
  demoMode: readBool(process.env.EXPO_PUBLIC_DEMO_MODE, false),
};

/**
 * Demo mode runs the app against a bundled in-memory corpus with no network.
 * It turns on automatically when Supabase is not configured, so the app is
 * always runnable for review even before a backend exists.
 */
export const isDemoMode = env.demoMode || env.supabaseUrl === '' || env.supabaseAnonKey === '';

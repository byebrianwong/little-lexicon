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
  demoMode: readBool(process.env.EXPO_PUBLIC_DEMO_MODE, false),
  /**
   * The two Claude features ("Make it personal" and the sentence check) need
   * their Edge Functions deployed with an Anthropic key, and each use costs
   * money. Off until both are set up.
   */
  aiFeatures: readBool(process.env.EXPO_PUBLIC_AI_FEATURES, false),
  /** "Continue with Google" needs Google set up as a provider in Supabase Auth. */
  googleSignIn: readBool(process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN, false),
};

/**
 * Demo mode runs the app against a bundled in-memory corpus with no network.
 * It turns on automatically when Supabase is not configured, so the app is
 * always runnable for review even before a backend exists.
 */
export const isDemoMode = env.demoMode || env.supabaseUrl === '' || env.supabaseAnonKey === '';

/** Demo mode has local stand-ins for both, so they always work there. */
export const aiFeaturesAvailable = isDemoMode || env.aiFeatures;
export const googleSignInAvailable = isDemoMode || env.googleSignIn;

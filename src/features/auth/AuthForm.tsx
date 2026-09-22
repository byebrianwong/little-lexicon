// Shared email + OAuth auth form used by sign-in and sign-up. This is the
// container: it talks to the backend and navigates. AuthFormView draws it.

import { useState } from 'react';
import { router } from 'expo-router';
import { backend } from '@/lib/backend';
import { isDemoMode } from '@/lib/env';
import { AuthFormView, type AuthCredentials } from './AuthFormView';

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const isSignUp = mode === 'sign-up';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit({ email, password, displayName }: AuthCredentials) {
    setBusy(true);
    setError(null);
    try {
      const res = isSignUp
        ? await backend.signUp(email.trim(), password, displayName.trim() || undefined)
        : await backend.signInWithPassword(email.trim(), password);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function oauth() {
    setBusy(true);
    setError(null);
    try {
      const res = await backend.signInWithOAuth('google');
      if (res.error) setError(res.error);
      else if (res.session) router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFormView
      mode={mode}
      busy={busy}
      error={error}
      showDemoNote={isDemoMode}
      onSubmit={submit}
      onOAuth={oauth}
      onSwitchMode={() => router.replace(isSignUp ? '/(auth)/sign-in' : '/(auth)/sign-up')}
    />
  );
}

// Shared email + OAuth auth form used by sign-in and sign-up.

import { useState } from 'react';
import { View , TextInput } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Divider, H1, Muted, Spacer } from '@/components/ui';
import { backend } from '@/lib/backend';
import { isDemoMode } from '@/lib/env';

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const isSignUp = mode === 'sign-up';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
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

  const inputClass =
    'rounded-2xl border border-border bg-surface px-4 py-4 text-text text-base mb-3';

  return (
    <View className="flex-1 justify-center">
      <H1>{isSignUp ? 'Create your account' : 'Welcome back'}</H1>
      <Muted className="mt-2">Advanced English vocabulary, one short session a day.</Muted>

      {isDemoMode ? (
        <Body className="mt-3 text-primary">
          Demo mode: any email and password works. Nothing leaves this device.
        </Body>
      ) : null}

      <Spacer h={20} />

      {isSignUp ? (
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name (optional)"
          placeholderTextColor="#6B7699"
          className={inputClass}
        />
      ) : null}
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#6B7699"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        className={inputClass}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor="#6B7699"
        secureTextEntry
        className={inputClass}
      />

      {error ? <Body className="text-danger mb-2">{error}</Body> : null}

      <Button
        title={isSignUp ? 'Sign up' : 'Sign in'}
        onPress={submit}
        loading={busy}
        disabled={email.trim() === '' || password === ''}
      />

      <Divider />
      <Button title="Continue with Google" variant="secondary" onPress={oauth} disabled={busy} />

      <Spacer h={16} />
      <Button
        title={isSignUp ? 'Have an account? Sign in' : 'New here? Create an account'}
        variant="ghost"
        onPress={() => router.replace(isSignUp ? '/(auth)/sign-in' : '/(auth)/sign-up')}
      />
    </View>
  );
}

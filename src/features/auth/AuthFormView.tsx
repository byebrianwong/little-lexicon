// The sign-in / sign-up form's layout. It owns what the user has typed; the
// container (AuthForm) owns the backend calls, the error text and navigation.

import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Body, Button, Divider, H1, Muted, Spacer } from '@/components/ui';

export interface AuthCredentials {
  email: string;
  password: string;
  displayName: string;
}

export interface AuthFormViewProps {
  mode: 'sign-in' | 'sign-up';
  busy: boolean;
  error: string | null;
  /** Demo builds accept any credentials and keep everything on the device. */
  showDemoNote: boolean;
  onSubmit: (credentials: AuthCredentials) => void;
  onOAuth: () => void;
  onSwitchMode: () => void;
}

const inputClass =
  'rounded-2xl border border-border bg-surface px-4 py-4 text-text text-base mb-3';

export function AuthFormView({
  mode,
  busy,
  error,
  showDemoNote,
  onSubmit,
  onOAuth,
  onSwitchMode,
}: AuthFormViewProps) {
  const isSignUp = mode === 'sign-up';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  return (
    <View className="flex-1 justify-center">
      <H1>{isSignUp ? 'Create your account' : 'Welcome back'}</H1>
      <Muted className="mt-2">Advanced English vocabulary, one short session a day.</Muted>

      {showDemoNote ? (
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
          accessibilityLabel="Display name (optional)"
          className={inputClass}
        />
      ) : null}
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#6B7699"
        accessibilityLabel="Email"
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
        accessibilityLabel="Password"
        secureTextEntry
        className={inputClass}
      />

      {error ? <Body className="text-danger mb-2">{error}</Body> : null}

      <Button
        title={isSignUp ? 'Sign up' : 'Sign in'}
        onPress={() => onSubmit({ email, password, displayName })}
        loading={busy}
        disabled={email.trim() === '' || password === ''}
      />

      <Divider />
      <Button title="Continue with Google" variant="secondary" onPress={onOAuth} disabled={busy} />

      <Spacer h={16} />
      <Button
        title={isSignUp ? 'Have an account? Sign in' : 'New here? Create an account'}
        variant="ghost"
        onPress={onSwitchMode}
      />
    </View>
  );
}

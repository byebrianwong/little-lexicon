// The sign-in / sign-up form's layout. It owns what the user has typed; the
// container (AuthForm) owns the backend calls, the error text and navigation.

import { useState } from 'react';
import { View } from 'react-native';
import { Body, Button, H1, Label, Note, Row, Rule, TextField } from '@/components/ui';

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
    <View className="flex-1 justify-center py-8">
      <Label>Little Lexicon</Label>
      <H1 className="mt-3 text-[40px] leading-[46px]">
        {isSignUp ? 'Create your account' : 'Welcome back'}
      </H1>
      <Note className="mt-2 text-[17px]">
        Advanced English vocabulary, one short session a day.
      </Note>

      {showDemoNote ? (
        <View className="mt-6 border-t border-rule pt-3">
          <Label tone="accent">Demo mode</Label>
          <Body className="mt-1 text-[16px] leading-[23px]">
            Any email and password works. Nothing leaves this device.
          </Body>
        </View>
      ) : null}

      <View className="mt-6 gap-2">
        {isSignUp ? (
          <TextField
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name (optional)"
            accessibilityLabel="Display name (optional)"
          />
        ) : null}
        <TextField
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          accessibilityLabel="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          accessibilityLabel="Password"
          secureTextEntry
        />
      </View>

      {error ? <Body className="mt-4 text-accent">{error}</Body> : null}

      <View className="mt-8">
        <Button
          title={isSignUp ? 'Sign up' : 'Sign in'}
          onPress={() => onSubmit({ email, password, displayName })}
          loading={busy}
          disabled={email.trim() === '' || password === ''}
        />
      </View>

      <Row className="my-6 gap-3">
        <Rule className="flex-1" />
        <Note>or</Note>
        <Rule className="flex-1" />
      </Row>
      <Button
        title="Continue with Google"
        variant="secondary"
        onPress={onOAuth}
        disabled={busy}
      />

      <View className="mt-6">
        <Button
          title={isSignUp ? 'Have an account? Sign in' : 'New here? Create an account'}
          variant="ghost"
          onPress={onSwitchMode}
        />
      </View>
    </View>
  );
}

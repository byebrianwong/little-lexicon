import { Screen } from '@/components/ui';
import { AuthForm } from '@/features/auth/AuthForm';

export default function SignIn() {
  return (
    <Screen scroll>
      <AuthForm mode="sign-in" />
    </Screen>
  );
}

import { Screen } from '@/components/ui';
import { AuthForm } from '@/features/auth/AuthForm';

export default function SignUp() {
  return (
    <Screen scroll>
      <AuthForm mode="sign-up" />
    </Screen>
  );
}

import type { Decorator, Meta, StoryObj } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { expect, userEvent, within } from 'storybook/test';
import { Screen } from '@/components/ui';
import { AuthFormView } from './AuthFormView';

// The form fills a screen, and both auth routes wrap it in <Screen scroll>.
const screen: Decorator = (Story) => (
  <View style={{ width: 390, height: 780 }}>
    <Screen scroll>
      <Story />
    </Screen>
  </View>
);

const meta = {
  title: 'Screens/Auth',
  component: AuthFormView,
  args: {
    mode: 'sign-in',
    busy: false,
    error: null,
    showDemoNote: false,
    onSubmit: () => {},
    onOAuth: () => {},
    onSwitchMode: () => {},
  },
  decorators: [screen],
} satisfies Meta<typeof AuthFormView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Sign in. The submit button is disabled until both fields have something. */
export const SignIn: Story = {};

/** Sign up adds an optional display name field. */
export const SignUp: Story = {
  args: { mode: 'sign-up' },
};

/** Credentials typed: the submit button turns on. */
export const Filled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText('Email'), 'ada@example.com');
    await userEvent.type(canvas.getByPlaceholderText('Password'), 'correct horse');
    await expect(canvas.getByPlaceholderText('Email')).toHaveValue('ada@example.com');
  },
};

/** A rejected sign-in. The message comes from the backend, above the button. */
export const WithError: Story = {
  args: { error: 'Invalid login credentials' },
};

/** Submitting: the button spins and the OAuth button is disabled. */
export const Submitting: Story = {
  args: { busy: true },
};

/** Demo builds say up front that any credentials work. */
export const DemoMode: Story = {
  args: { showDemoNote: true, mode: 'sign-up' },
};

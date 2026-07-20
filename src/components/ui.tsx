// Small, shared UI primitives styled with NativeWind. Dark-first palette from
// tailwind.config.js. Kept minimal; screens compose these.

import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({
  children,
  scroll = false,
  className,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  className?: string;
}) {
  const inner = (
    <View className={`flex-1 px-5 ${className ?? ''}`}>{children}</View>
  );
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView
          className="flex-1 bg-bg"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function H1({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Text className={`text-text text-3xl font-bold ${className ?? ''}`}>{children}</Text>;
}

export function H2({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text className={`text-text text-xl font-semibold ${className ?? ''}`}>{children}</Text>
  );
}

export function Body({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Text className={`text-text text-base ${className ?? ''}`}>{children}</Text>;
}

export function Muted({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Text className={`text-muted text-sm ${className ?? ''}`}>{children}</Text>;
}

export function Card({ children, className, ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={`bg-surface border border-border rounded-2xl p-4 ${className ?? ''}`}
      {...rest}
    >
      {children}
    </View>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'primary' | 'success' | 'danger' | 'gold';
}) {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/20 text-primary'
      : tone === 'success'
        ? 'bg-success/20 text-success'
        : tone === 'danger'
          ? 'bg-danger/20 text-danger'
          : tone === 'gold'
            ? 'bg-gold/20 text-gold'
            : 'bg-surface2 text-muted';
  return (
    <View className={`self-start rounded-full px-3 py-1 ${toneClass}`}>
      <Text className={`text-xs font-semibold ${toneClass}`}>{children}</Text>
    </View>
  );
}

type ButtonProps = PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  loading?: boolean;
  className?: string;
};

export const Button = forwardRef<View, ButtonProps>(function Button(
  { title, variant = 'primary', loading, disabled, className, ...rest },
  ref,
) {
  const base = 'rounded-2xl px-5 py-4 items-center justify-center';
  const byVariant =
    variant === 'primary'
      ? 'bg-primary active:bg-primary-dark'
      : variant === 'secondary'
        ? 'bg-surface2 border border-border active:opacity-80'
        : variant === 'danger'
          ? 'bg-danger active:opacity-80'
          : variant === 'success'
            ? 'bg-success active:opacity-80'
            : 'bg-transparent active:opacity-60';
  const textColor =
    variant === 'secondary' || variant === 'ghost' ? 'text-text' : 'text-white';
  const isDisabled = disabled || loading;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      disabled={isDisabled}
      className={`${base} ${byVariant} ${isDisabled ? 'opacity-50' : ''} ${className ?? ''}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text className={`text-base font-semibold ${textColor}`}>{title}</Text>
      )}
    </Pressable>
  );
});

export function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <View className="h-3 w-full bg-surface2 rounded-full overflow-hidden">
      <View className="h-3 bg-primary rounded-full" style={{ width: `${pct}%` }} />
    </View>
  );
}

export function Divider() {
  return <View className="h-px bg-border my-4" />;
}

export function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={`flex-row items-center ${className ?? ''}`}>{children}</View>;
}

export function Spacer({ h = 12 }: { h?: number }) {
  return <View style={{ height: h }} />;
}

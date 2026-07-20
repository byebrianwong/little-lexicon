import { Pressable, Text } from 'react-native';

export function OptionButton({
  label,
  onPress,
  state,
  disabled,
}: {
  label: string;
  onPress: () => void;
  // visual state after answering
  state: 'idle' | 'correct' | 'wrong' | 'muted';
  disabled?: boolean;
}) {
  const cls =
    state === 'correct'
      ? 'border-success bg-success/15'
      : state === 'wrong'
        ? 'border-danger bg-danger/15'
        : state === 'muted'
          ? 'border-border bg-surface opacity-50'
          : 'border-border bg-surface active:bg-surface2';
  const textCls =
    state === 'correct' ? 'text-success' : state === 'wrong' ? 'text-danger' : 'text-text';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-2xl border px-4 py-4 mb-3 ${cls}`}
    >
      <Text className={`text-base ${textCls}`}>{label}</Text>
    </Pressable>
  );
}

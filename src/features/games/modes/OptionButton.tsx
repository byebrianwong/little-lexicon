// One answer in a multiple-choice question, drawn as a ruled line with a
// letter at the left. After the answer the red pen marks the rows: a tick on
// the right answer, a cross and a strike-through on a wrong pick. Colour is
// never the only signal, so the marks read in greyscale too.

import { Pressable, Text, View } from 'react-native';
import { cx } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/colors';

export type OptionState = 'idle' | 'correct' | 'wrong' | 'muted';

const LETTERS = 'abcdefgh';

export function OptionButton({
  label,
  onPress,
  state,
  disabled,
  index,
}: {
  label: string;
  onPress: () => void;
  // visual state after answering
  state: OptionState;
  disabled?: boolean;
  /** Position in the list, shown as a, b, c, d. Left out, no letter shows. */
  index?: number;
}) {
  const letter = index !== undefined ? LETTERS[index] : undefined;
  const spoken =
    state === 'correct'
      ? `${label}, correct answer`
      : state === 'wrong'
        ? `${label}, your answer, wrong`
        : label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cx(
        'min-h-[54px] flex-row items-start gap-3 border-t border-rule py-3',
        !disabled && 'active:bg-paper-deep web:hover:bg-paper-deep',
      )}
    >
      {letter ? (
        <Text
          className={cx(
            'w-4 pt-[4px] font-serif-italic text-[15px] leading-[20px]',
            state === 'correct' ? 'text-accent' : 'text-graphite',
          )}
        >
          {letter}
        </Text>
      ) : null}
      <Text
        className={cx(
          'flex-1 text-[19px] leading-[27px]',
          state === 'correct'
            ? 'font-serif-medium text-ink'
            : state === 'wrong'
              ? 'font-serif text-graphite line-through'
              : state === 'muted'
                ? 'font-serif text-graphite'
                : 'font-serif text-ink',
        )}
      >
        {label}
      </Text>
      {state === 'correct' || state === 'wrong' ? (
        <View className="pt-[4px]">
          <Icon
            name={state === 'correct' ? 'check' : 'cross'}
            color={colors.accent}
            strokeWidth={2.25}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Holds a set of OptionButtons and draws the rule under the last one. */
export function OptionList({ children }: { children: React.ReactNode }) {
  return <View className="border-b border-rule">{children}</View>;
}

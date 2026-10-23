// The outline of the word being typed, under the answer box: a slot per letter,
// the letters shown so far, and the length. Typed modes always show the first
// letter; the hint shows more. Each slot is its own underline because the
// serif's underscores run together and make the blanks hard to count.

import { Text, View } from 'react-native';
import { cx } from '@/components/ui';
import { tw } from '@/components/tw';
import { letterCount, letterSlots } from '@/lib/text';

export function LetterCue({
  target,
  shown,
  className,
}: {
  target: string;
  shown: number;
  className?: string;
}) {
  const slots = letterSlots(target, shown);
  const count = letterCount(target);
  const start = slots
    .slice(0, shown)
    .map((s) => s.char ?? '')
    .join('');
  return (
    <View
      accessible
      accessibilityLabel={`Starts with "${start}", ${count} letters`}
      className={tw('flex-row flex-wrap items-end gap-y-2', className)}
    >
      <View className="mr-3 flex-row flex-wrap gap-x-[5px] gap-y-2">
        {slots.map((slot, i) => (
          <View
            key={i}
            className={cx(
              'h-[28px] w-[16px] items-center',
              slot.letter && 'border-b border-ink',
            )}
          >
            <Text className="font-serif-medium text-[20px] leading-[26px] text-ink">
              {slot.char ?? ''}
            </Text>
          </View>
        ))}
      </View>
      <Text className="font-serif-italic text-[16px] leading-[23px] text-graphite">
        {`${count} letters`}
      </Text>
    </View>
  );
}

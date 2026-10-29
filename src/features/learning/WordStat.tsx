// A word count on Home or Progress (Learning, Due, Known) that opens the
// Learning view on its list.

import { Stat } from '@/components/ui';

export function WordStat({
  value,
  label,
  onPress,
}: {
  /** Undefined while it loads. */
  value: number | undefined;
  label: string;
  onPress: () => void;
}) {
  const n = value ?? 0;
  return (
    <Stat
      value={n}
      label={label}
      onPress={onPress}
      accessibilityLabel={`${label}: ${n} ${n === 1 ? 'word' : 'words'}. Show them`}
    />
  );
}

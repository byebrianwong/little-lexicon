// The question itself when it is a sentence rather than a word: a definition
// to match, a sentence with a gap. Larger than body text, smaller than a
// headword, so the eye lands on it first.

import { Text, type TextProps } from 'react-native';
import { tw } from '@/components/tw';

export function Prompt({
  children,
  className,
  ...rest
}: { children: React.ReactNode; className?: string } & Omit<TextProps, 'children'>) {
  return (
    <Text
      className={tw(
        'font-serif-medium text-[27px] leading-[34px] tracking-[-0.2px] text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </Text>
  );
}

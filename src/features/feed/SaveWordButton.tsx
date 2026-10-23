// "Save for later" under a word, on every screen that shows one: the new-word
// card, the answer reveal, the speed round and an open row in All words. The
// Discover feed has its own larger button for the same thing.
//
// It only draws the state and reports the tap. The screen keeps the saved
// words (useSavedWords) and passes them down.

import { Pressable, Text } from 'react-native';
import { tw } from '@/components/tw';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/colors';

export function SaveWordButton({
  headword,
  saved,
  onPress,
  className,
}: {
  headword: string;
  saved: boolean;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      // Starts with the visible text, so voice control finds it, and names the
      // word and what a tap does.
      accessibilityLabel={
        saved ? `Saved: ${headword}. Remove it from saved words` : `Save for later: ${headword}`
      }
      onPress={onPress}
      className={tw(
        'min-h-[44px] flex-row items-center gap-2 self-start active:opacity-60 web:hover:opacity-70',
        className,
      )}
    >
      <Icon
        name={saved ? 'bookmark-filled' : 'bookmark'}
        size={18}
        color={saved ? colors.accent : colors.ink}
      />
      <Text className="font-serif-medium text-[16px] leading-[22px] text-ink underline">
        {saved ? 'Saved' : 'Save for later'}
      </Text>
    </Pressable>
  );
}

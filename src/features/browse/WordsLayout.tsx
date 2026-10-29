// The Words tab's frame: the title and a switch between its four views.
//
// - Discover: a feed of unseen words, one per screen, for picking what to
//   learn next.
// - Saved: every word the user saved, with how each one is going.
// - Learning: every word the user has started, by Learning, Due and Known,
//   with each word's stats (features/learning).
// - All words: the whole collection, searchable.
//
// The switch is drawn like the tab bar, as text with a short red rule under
// the current view, because it is a second level of the same navigation.

import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cx, H1 } from '@/components/ui';

export type WordsViewId = 'discover' | 'list' | 'learning' | 'all';

const VIEWS: { id: WordsViewId; label: string }[] = [
  { id: 'discover', label: 'Discover' },
  { id: 'list', label: 'Saved' },
  { id: 'learning', label: 'Learning' },
  { id: 'all', label: 'All words' },
];

export interface WordsLayoutProps {
  view: WordsViewId;
  onChangeView: (view: WordsViewId) => void;
  /** How many words are saved. Undefined while the list loads. */
  listCount: number | undefined;
  children: React.ReactNode;
}

export function WordsLayout({ view, onChangeView, listCount, children }: WordsLayoutProps) {
  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <View className="w-full max-w-[640px] self-center px-6 pt-10">
        <H1>Words</H1>
        {/* Four views fit one line on a 360-point phone with this gap. A
            narrower screen, or a long saved count, wraps the last one to a
            second line rather than cutting it off. */}
        <View accessibilityRole="tablist" className="mt-3 flex-row flex-wrap gap-x-4">
          {VIEWS.map((v) => {
            const selected = v.id === view;
            const count = v.id === 'list' && listCount ? listCount : null;
            return (
              <Pressable
                key={v.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={
                  count ? `${v.label}, ${count} ${count === 1 ? 'word' : 'words'}` : v.label
                }
                onPress={() => onChangeView(v.id)}
                className="min-h-[44px] justify-center"
              >
                <View className="flex-row items-baseline gap-1">
                  <Text
                    className={cx(
                      'text-[17px] leading-[22px]',
                      selected ? 'font-serif-medium text-ink' : 'font-serif text-graphite',
                    )}
                  >
                    {v.label}
                  </Text>
                  {count ? (
                    <Text className="font-serif text-[14px] leading-[18px] text-graphite">
                      {count}
                    </Text>
                  ) : null}
                </View>
                <View
                  className={cx('mt-1 h-[2px] w-5', selected ? 'bg-accent' : 'bg-transparent')}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
      <View className="h-px w-full bg-rule" />
      <View className="flex-1">{children}</View>
    </SafeAreaView>
  );
}

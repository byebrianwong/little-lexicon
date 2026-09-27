// The Words tab's frame: the title and a switch between its three views.
//
// - Discover: a feed of unseen words, one per screen, for picking what to
//   learn next.
// - Your list: the words picked, waiting for a session.
// - All words: the whole collection, searchable.
//
// The switch is drawn like the tab bar, as text with a short red rule under
// the current view, because it is a second level of the same navigation.

import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cx, H1 } from '@/components/ui';

export type WordsViewId = 'discover' | 'list' | 'all';

const VIEWS: { id: WordsViewId; label: string }[] = [
  { id: 'discover', label: 'Discover' },
  { id: 'list', label: 'Your list' },
  { id: 'all', label: 'All words' },
];

export interface WordsLayoutProps {
  view: WordsViewId;
  onChangeView: (view: WordsViewId) => void;
  /** Words waiting on the list. Undefined while it loads. */
  listCount: number | undefined;
  children: React.ReactNode;
}

export function WordsLayout({ view, onChangeView, listCount, children }: WordsLayoutProps) {
  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <View className="w-full max-w-[640px] self-center px-6 pt-10">
        <H1>Words</H1>
        <View accessibilityRole="tablist" className="mt-3 flex-row gap-6">
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

// The tab bar, drawn as text. On a phone it sits at the bottom; in a browser
// wider than a tablet it becomes a masthead across the top with the app's name
// at the left, because a bottom bar reads as a phone app on a desktop screen.
// Native apps keep it at the bottom at every size, iPad included, as iOS and
// Android apps do.
//
// app/(app)/_layout.tsx passes the navigator's props straight through.

import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { cx } from './ui';

/** At or above this width, in a browser, the tabs move to the top. */
export const WIDE_MIN = 768;

export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_MIN;
}

export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const wide = useIsWide();

  const tabs = state.routes.map((route, index) => {
    const options = descriptors[route.key]?.options;
    const label = options?.title ?? route.name;
    const focused = state.index === index;

    function onPress() {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented)
        navigation.navigate(route.name, route.params);
    }

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={onPress}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        className={cx(
          'min-h-[44px] items-center justify-center',
          wide ? 'px-1' : 'flex-1',
        )}
      >
        <Text
          className={cx(
            'text-[15px] leading-[20px]',
            focused ? 'font-serif-medium text-ink' : 'font-serif text-graphite',
          )}
        >
          {label}
        </Text>
        {/* The red pen marks where you are. */}
        <View
          className={cx('mt-1 h-[2px] w-5', focused ? 'bg-accent' : 'bg-transparent')}
        />
      </Pressable>
    );
  });

  if (wide) {
    return (
      <View style={{ paddingTop: insets.top }} className="border-b border-ink bg-paper">
        <View className="h-16 w-full max-w-[960px] flex-row items-center justify-between self-center px-8">
          <Text className="font-serif-medium text-[22px] leading-[28px] text-ink">
            Little Lexicon
          </Text>
          <View accessibilityRole="tablist" className="flex-row gap-8">
            {tabs}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
      className="border-t border-rule bg-paper"
    >
      <View
        accessibilityRole="tablist"
        className="w-full max-w-[640px] flex-row self-center px-2 pt-2"
      >
        {tabs}
      </View>
    </View>
  );
}

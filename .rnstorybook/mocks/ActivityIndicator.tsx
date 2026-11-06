// Stands in for React Native's ActivityIndicator in Storybook on a device. The
// real spinner never stops, so a story that shows one can look different in each
// snapshot: 11 of 201 stories changed between launches on the iOS simulator. In a
// browser, Chromatic pauses animations itself. Whether it does so on a device is
// not known.

import { View, type ActivityIndicatorProps } from 'react-native';

const DIAMETERS = { small: 20, large: 36 };

export default function ActivityIndicator({
  color,
  size = 'small',
  style,
}: ActivityIndicatorProps) {
  const diameter = typeof size === 'number' ? size : DIAMETERS[size];
  return (
    <View
      accessibilityLabel="Loading"
      style={[
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          borderWidth: 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

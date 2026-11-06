// Global story setup on a device: the paper background and safe-area insets.
// .storybook/preview.tsx cannot be shared because it loads fonts through
// document.fonts, which only exists in a browser. Fonts load in index.tsx.

import type { Preview } from '@storybook/react-native';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';

const preview: Preview = {
  decorators: [
    (Story) => (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.paper, padding: 16 }}>
          <Story />
        </View>
      </SafeAreaProvider>
    ),
  ],
};

export default preview;

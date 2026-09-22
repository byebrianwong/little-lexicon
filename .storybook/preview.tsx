// Global story setup: Tailwind CSS, the dark app background, and a fixed
// safe-area frame so snapshots do not shift between runs.

import '../global.css';
import { View } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import type { Preview } from '@storybook/react-native-web-vite';

// react-native-safe-area-context reads real device insets on a phone and
// returns nothing on web. Pinning them keeps every story the same size in
// Chromatic, so a diff means the component changed.
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const preview: Preview = {
  parameters: {
    // The app has one dark palette; Storybook's background switcher would only
    // offer combinations that never ship.
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i } },
  },
  decorators: [
    (Story) => (
      <SafeAreaProvider initialMetrics={metrics}>
        <View style={{ backgroundColor: '#0B1020', padding: 16 }}>
          <Story />
        </View>
      </SafeAreaProvider>
    ),
  ],
};

export default preview;

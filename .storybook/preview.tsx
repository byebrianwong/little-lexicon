// Global story setup: Tailwind CSS, the Newsreader faces, the paper
// background, and a fixed safe-area frame so snapshots do not shift between
// runs.

import '../global.css';
import './paper.css';
import { View } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import type { Preview } from '@storybook/react-native-web-vite';
import { colors } from '../src/theme/colors';

// react-native-safe-area-context reads real device insets on a phone and
// returns nothing on web. Pinning them keeps every story the same size in
// Chromatic, so a diff means the component changed.
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// The browser fetches a font face only when some text first uses it, so
// without this a play function can run while faces are still arriving. When a
// face lands after a play function has scrolled, Chrome moves the scroll
// position by a pixel to keep the line at the top of the view in place, and
// the snapshot shifts with it (Screens/Settings, ChangingKnownWordFrequency,
// was 1 px off in about one capture in five). A face that fails to load
// rejects, which fails the story instead of capturing the wrong typeface.
async function loadNewsreader() {
  const faces: Promise<FontFace>[] = [];
  document.fonts.forEach((face) => {
    if (face.family.includes('Newsreader')) faces.push(face.load());
  });
  await Promise.all(faces);
}

const preview: Preview = {
  loaders: [loadNewsreader],
  parameters: {
    // Runs axe against every story. Chromatic needs this alongside the addon
    // and the project's own Accessibility setting; all three are required
    // before any violation is reported.
    a11y: { test: 'error' },
    // The app has one paper palette; Storybook's background switcher would only
    // offer combinations that never ship.
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i } },
  },
  decorators: [
    (Story) => (
      <SafeAreaProvider initialMetrics={metrics}>
        <View style={{ backgroundColor: colors.paper, padding: 16 }}>
          <Story />
        </View>
      </SafeAreaProvider>
    ),
  ],
};

export default preview;

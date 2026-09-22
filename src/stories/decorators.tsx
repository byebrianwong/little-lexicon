// Decorators shared by story files.

import { View } from 'react-native';
import type { Decorator } from '@storybook/react-native-web-vite';
import { GameProvider } from '@/features/games/GameContext';
import { POOL, profile } from './fixtures';

/** Column the width of a phone's content area, for a single component. */
export const column: Decorator = (Story) => (
  <View style={{ width: 340 }}>
    <Story />
  </View>
);

/**
 * A whole screen at iPhone 14 size. Screens fill their container, so without a
 * fixed frame they collapse to their content and snapshots shift as content
 * changes.
 */
export const phone: Decorator = (Story) => (
  <View style={{ width: 390, height: 844 }}>
    <Story />
  </View>
);

/** Game modes read the distractor pool and profile from context. */
export const game: Decorator = (Story) => (
  <View style={{ width: 350 }}>
    <GameProvider value={{ pool: POOL, profile: profile() }}>
      <Story />
    </GameProvider>
  </View>
);

// Decorators shared by story files.

import { useState } from 'react';
import { View } from 'react-native';
import type { Decorator } from '@storybook/react-native-web-vite';
import { GameProvider } from '@/features/games/GameContext';
import type { WordContent } from '@/lib/types';
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

/**
 * Game modes read the distractor pool, the profile and the saved words from
 * context. Saving works within the story, so the Save control can be tried.
 */
export const game: Decorator = (Story) => (
  <View style={{ width: 350 }}>
    <GameStoryProvider>
      <Story />
    </GameStoryProvider>
  </View>
);

function GameStoryProvider({ children }: { children: React.ReactNode }) {
  const [savedIds, setSavedIds] = useState<ReadonlySet<number>>(new Set());
  const toggle = (word: WordContent) =>
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(word.wordId)) next.add(word.wordId);
      return next;
    });
  return (
    <GameProvider value={{ pool: POOL, profile: profile(), saved: { savedIds, toggle } }}>
      {children}
    </GameProvider>
  );
}

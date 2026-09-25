// After an answer, the reveal panel and its Continue button mount below the
// question. On a long question (four definition-length options, say) they
// land under the fold, so the user has to scroll before they can move on.
//
// The runner owns the ScrollView. It provides a scroll-to-end function here,
// and the reveal panel calls it once it has laid out. Without a provider (the
// reveal in isolation, as in Storybook) the call is a no-op.

import { createContext, useCallback, useContext, type ReactNode, type RefObject } from 'react';
import type { ScrollView } from 'react-native';

const RevealScrollContext = createContext<() => void>(() => {});

export function RevealScrollProvider({
  scrollRef,
  children,
}: {
  scrollRef: RefObject<ScrollView | null>;
  children: ReactNode;
}) {
  const scrollToReveal = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [scrollRef]);
  return (
    <RevealScrollContext.Provider value={scrollToReveal}>{children}</RevealScrollContext.Provider>
  );
}

/** Scrolls the question area so the reveal panel and Continue are on screen. */
export function useScrollToReveal(): () => void {
  return useContext(RevealScrollContext);
}

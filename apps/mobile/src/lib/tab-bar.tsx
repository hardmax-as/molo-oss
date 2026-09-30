import { useFocusEffect } from "expo-router";
import { createContext, useCallback, useContext } from "react";

/**
 * Filled by the tabs layout with the setter for NativeTabs' `hidden` prop.
 * Native tabs cannot hide the bar per screen, so screens that need the whole
 * viewport (the lesson runner) hide it while focused and restore it on blur,
 * the way the Expo Router docs suggest.
 */
export const TabBarContext = createContext<(hidden: boolean) => void>(() => undefined);

export function useHideTabBar() {
  const setHidden = useContext(TabBarContext);
  useFocusEffect(
    useCallback(() => {
      setHidden(true);
      return () => setHidden(false);
    }, [setHidden]),
  );
}

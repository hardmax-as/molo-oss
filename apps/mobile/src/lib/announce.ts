import { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/**
 * Say something out loud, on the platform where saying it is not automatic.
 *
 * `accessibilityLiveRegion` is Android-only — React Native's own types mark it
 * `@platform android` — so a live region announces the verdict on Android and
 * says nothing at all on iOS. The text is in the tree and reachable either
 * way, but VoiceOver will not speak it unless the learner goes looking, and
 * the verdict is the one announcement that has to arrive on its own.
 *
 * So each platform keeps the mechanism that works on it: Android keeps its
 * live regions, iOS gets an explicit announcement, and neither says the same
 * thing twice. See `docs/ACCESSIBILITY.md` ("Mobile").
 *
 * The announcement is skipped when it has not changed, because the effect
 * re-runs on every render of the component holding it and VoiceOver would
 * otherwise repeat itself over a re-render the learner did not cause.
 */
export function announce(message: string): void {
  if (Platform.OS === "android") return;
  const text = message.trim();
  if (!text) return;
  // `queue: false` interrupts: a verdict that arrives after the next question
  // has been read is worse than no verdict. Both options are iOS-only, which
  // is the only platform that reaches this line.
  AccessibilityInfo.announceForAccessibilityWithOptions(text, {
    queue: false,
    priority: "high",
  });
}

/**
 * What, if anything, to say — given the message now on screen and the one
 * last said. Null means "say nothing": either there is nothing there, or it
 * is the same sentence the screen reader has already read.
 *
 * Separate from the hook because this is the part with a rule in it, and a
 * rule that repeats a verdict on every re-render is a bug a learner hears.
 */
export function announcementFor(
  message: string | null | undefined,
  alreadySpoken: string | null,
): string | null {
  const text = message?.trim() ?? "";
  if (!text) return null;
  return text === alreadySpoken ? null : text;
}

/**
 * Announce `message` whenever it changes to something non-empty. Pass null or
 * an empty string for "nothing to say"; clearing it does not announce, and
 * does not stop the same message being announced again after something else.
 */
export function useAnnounce(message: string | null | undefined): void {
  const spoken = useRef<string | null>(null);
  useEffect(() => {
    const text = message?.trim() ?? "";
    if (!text) {
      spoken.current = null;
      return;
    }
    const next = announcementFor(text, spoken.current);
    if (next === null) return;
    spoken.current = next;
    announce(next);
  }, [message]);
}

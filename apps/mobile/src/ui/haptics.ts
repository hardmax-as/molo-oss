import * as Haptics from "expo-haptics";

/** Haptics never throw into the UI: the simulator and some Android devices have none. */
const safe = (p: Promise<void>) => p.catch(() => undefined);

export const haptic = {
  tap: () => safe(Haptics.selectionAsync()),
  light: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};

import { createI18n } from "@molo/i18n";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { colors } from "~/ui/theme.ts";

import { deletePushToken, putPushToken } from "./api.ts";
import { deviceLanguage } from "./i18n.tsx";
import { pushPlatform, type PushPermission, type PushPorts } from "./push-logic.ts";

/**
 * The native side of streak reminders: permissions, the Expo push token and
 * the Android channel. Kept apart from the provider (src/lib/push.tsx) so
 * sign-out can reach it without importing the session back (import cycle).
 */

/** The Android channel the nightly push targets (`channelId` in apps/api/src/push.ts). */
export const REMINDER_CHANNEL = "reminders";

/** A reminder that arrives while the app is open still shows; it is a nudge, not an interruption. */
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
});

function toPermission(status: Notifications.NotificationPermissionsStatus): PushPermission {
  if (status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return "granted";
  }
  return status.canAskAgain ? "undetermined" : "denied";
}

/** EAS sets this at build time; without it Expo cannot mint a token and the toggle reports a failure. */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | null | undefined;
  return extra?.eas?.projectId ?? undefined;
}

const platform = pushPlatform(Platform.OS);

/** The token this device last registered, so sign-out can withdraw exactly it. */
let registered: string | null = null;

export const pushPorts: PushPorts = {
  isDevice: Device.isDevice && platform !== null,
  platform: platform ?? "ios",
  appVersion: Constants.expoConfig?.version ?? null,
  getPermission: async () => toPermission(await Notifications.getPermissionsAsync()),
  requestPermission: async () =>
    toPermission(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      }),
    ),
  getToken: async () => {
    const id = projectId();
    const token = await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : {});
    return token.data || null;
  },
  register: async (registration) => {
    await putPushToken(registration);
    registered = registration.token;
  },
  unregister: async (token) => {
    await deletePushToken(token ?? registered);
    registered = null;
  },
  prepareChannel: async () => {
    if (Platform.OS !== "android") return;
    // The channel name is shown in Android's own settings, so it is translated too.
    const t = createI18n(deviceLanguage());
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: t.t("settings.pushReminders"),
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: colors.sun,
    });
  },
};

/**
 * Sign-out: the account should stop reaching this phone the moment the
 * session ends. Best effort — the cookie is about to go either way, and a
 * token the server keeps is disabled on its first `DeviceNotRegistered`.
 */
export async function forgetThisDevice(): Promise<void> {
  if (!registered) return;
  await pushPorts.unregister(registered).catch(() => undefined);
}

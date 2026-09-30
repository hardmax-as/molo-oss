// @ts-check
/**
 * app.json is the configuration; this only patches in what differs per
 * machine and localized system permission prompts. EAS keeps google-services.json
 * as the file variable
 * GOOGLE_SERVICES_JSON and hands the build a path to it, while a laptop has
 * the gitignored copy next to app.json. Other settings stay static so
 * `eas config` and the docs keep reading app.json as the source of truth.
 *
 * Plain JavaScript on purpose: the EAS builder evaluates this with Node
 * 22.11, which cannot strip TypeScript syntax, and the iOS and Android
 * builds both died in prebuild on the `.ts` version.
 */
// Only the native strings, never the UI locale files: Expo's fingerprint hashes
// every file this config requires, so reading en.json/nb.json here made any
// UI copy change look native and blocked every production OTA after 1.0.2.
const native = require("../../packages/i18n/src/native/permissions.json");
const en = { permissions: native.en };
const nb = { permissions: native.nb };

/**
 * @param {import("expo/config").ConfigContext} ctx
 * @returns {import("expo/config").ExpoConfig}
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: (config.plugins ?? []).map((plugin) =>
    plugin === "expo-audio"
      ? [
          "expo-audio",
          {
            microphonePermission: en.permissions.microphone,
            // Clips play while the app is open; nothing plays in the background.
            // The plugin's default (true) would add the iOS `audio` background
            // mode and an Android media-playback foreground service, which both
            // stores make you justify (Apple 2.5.4, Play foreground-service form).
            enableBackgroundPlayback: false,
            enableBackgroundRecording: false,
          },
        ]
      : plugin,
  ),
  locales: {
    ...config.locales,
    en: { ios: { NSMicrophoneUsageDescription: en.permissions.microphone } },
    nb: { ios: { NSMicrophoneUsageDescription: nb.permissions.microphone } },
  },
  android: {
    ...config.android,
    googleServicesFile: process.env["GOOGLE_SERVICES_JSON"] ?? "./google-services.json",
  },
});

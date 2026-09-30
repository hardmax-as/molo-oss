// Bundle notices from the installed dependency trees for EAS builds and OTA exports.
const { execFileSync } = require("node:child_process");
const path = require("node:path");
execFileSync("bun", [path.resolve(__dirname, "../../scripts/generate-licences.ts"), "--live"], {
  stdio: "inherit",
});

// Expo SDK 57 resolves workspace packages on its own (docs/guides/monorepos);
// the explicit watchFolders/nodeModulesPaths are only needed for older SDKs.
// NativeWind wraps the config to compile global.css at build time.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// NativeWind's default rem is 14 on native, which shrinks every Tailwind
// size by an eighth: h-11 lands at 38.5 pt instead of the 44 pt touch
// target and text-base at 14 pt. The classes in this app are written
// against the web scale, so pin rem to 16 (the library notes).
module.exports = withNativeWind(config, { input: "./global.css", inlineRem: 16 });

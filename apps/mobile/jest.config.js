/**
 * Jest for the pure helpers (docs/STACK.md: Jest + Maestro on mobile). The
 * jest-expo preset provides the Babel transform and module mocks; the suite
 * tests pure helpers and mocks native ports in auth tests, so it runs on any CI.
 */
// Babel emits runtime imports for native modules; resolve React Native's already
// installed runtime through Bun's isolated package layout.
const path = require("node:path");
const babelRuntime = path.dirname(
  require.resolve("@babel/runtime/package.json", {
    paths: [require.resolve("react-native/package.json")],
  }),
);
// jest-expo's own react-test-renderer (the version it pins to our React), for `.spec.tsx`.
const testRenderer = require.resolve("react-test-renderer", {
  paths: [path.dirname(require.resolve("jest-expo/package.json"))],
});

module.exports = {
  preset: "jest-expo",
  transform: {
    "\\.mjs$": [
      require.resolve("babel-jest", { paths: [require.resolve("jest-expo/package.json")] }),
      { presets: ["babel-preset-expo"] },
    ],
  },
  // `.spec.tsx` renders a component with react-test-renderer, which jest-expo
  // itself depends on (resolved below; no dependency of our own).
  testMatch: ["<rootDir>/src/**/*.spec.ts", "<rootDir>/src/**/*.spec.tsx"],
  moduleNameMapper: {
    "^~/(.*)$": "<rootDir>/src/$1",
    "^@babel/runtime/(.*)$": `${babelRuntime}/$1`,
    "^react-test-renderer$": testRenderer,
  },
  // Bun's isolated layout puts every package under node_modules/.bun/<name>@<ver>/node_modules/,
  // so the allowlist is matched against that folder name (scope slash becomes "+").
  transformIgnorePatterns: [
    "node_modules/\\.bun/(?!(?:@react-native\\+|react-native|expo|@expo|jest-expo|@sentry\\+react-native|@molo\\+|nativewind|@react-native-async-storage|rettime|until-async|@open-draft\\+))",
  ],
};

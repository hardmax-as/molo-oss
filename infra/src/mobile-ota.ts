import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { checkPublisher, eas, mobileRoot, run, summary } from "./mobile-command.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    branch: { type: "string" },
    message: { type: "string" },
    live: { type: "boolean", default: false },
  },
});
const branch = values.branch;
if (branch !== "preview" && branch !== "production")
  throw new Error("Branch must be preview or production");
if (!values.message?.trim()) throw new Error("An update message is required");
if (!values.live) {
  summary(
    `Dry run: publish an update to ${branch}, then upload its source maps to Sentry EU. Pass --live to apply.`,
  );
} else {
  checkPublisher();
  eas([
    "update",
    "--branch",
    branch,
    "--message",
    values.message,
    // Without it CI has no EXPO_PUBLIC_* but the API URL, and every update
    // shipped without the Sentry DSN and the RevenueCat keys.
    "--environment",
    branch,
    "--non-interactive",
    "--emit-metadata",
  ]);
  assertBundleHasSentryDsn();
  try {
    if (!process.env["SENTRY_AUTH_TOKEN"]) throw new Error("Missing source-map credential");
    process.env["SENTRY_ORG"] = "malmo-development";
    process.env["SENTRY_PROJECT"] = "molo-mobile";
    process.env["SENTRY_URL"] = "https://de.sentry.io/";
    run(
      ["node", "node_modules/@sentry/react-native/scripts/expo-upload-sourcemaps.js", "dist"],
      mobileRoot,
      true,
    );
    summary(`Sentry EU source maps uploaded for ${branch}.`);
  } catch {
    console.warn("::warning::OTA published, but its Sentry source-map upload failed.");
    summary(
      `Warning: the ${branch} OTA succeeded, but Sentry source-map upload failed; retry the upload before investigating crashes.`,
    );
  }
}

/**
 * The published JS must carry a DSN, or the app reports no crash at all. A
 * DSN names its ingest host, so look for that in the exported bundles.
 */
function assertBundleHasSentryDsn() {
  const bundles = join(mobileRoot, "dist/_expo/static/js");
  const files = readdirSync(bundles, { recursive: true, encoding: "utf8" }).filter((f) =>
    /\.(hbc|js)$/.test(f),
  );
  const missing = files.filter(
    (f) => !readFileSync(join(bundles, f)).includes("ingest.de.sentry.io"),
  );
  if (files.length === 0 || missing.length > 0)
    throw new Error(
      `Published bundle without a Sentry DSN: ${missing.join(", ") || "no bundles found"}`,
    );
}

import type { Options } from "@sentry/bundler-plugins/core";

/** Only the authorized deploy may upload; a token in a developer's .env is not consent. */
export function sentryBuildOptions(
  project: "molo-web" | "molo-api",
  env: Record<string, string | undefined>,
): Options | undefined {
  if (env["MOLO_LIVE"] !== "1" || !env["SENTRY_AUTH_TOKEN"]?.trim()) return undefined;
  const release = env["SENTRY_RELEASE"];
  if (!release || !/^[a-f0-9]{40}$/.test(release))
    throw new Error("SENTRY_RELEASE must be the full git SHA for source map uploads");
  return {
    org: "malmo-development",
    project,
    url: "https://de.sentry.io",
    authToken: env["SENTRY_AUTH_TOKEN"],
    telemetry: false,
    debug: false,
    release: { name: release, inject: true, setCommits: false, deploy: false },
    ...(project === "molo-web"
      ? { sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] } }
      : {}),
  };
}

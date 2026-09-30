const NATIVE_REASONS = new Set([
  "bareNativeDir",
  "rncoreAutolinkingAndroid",
  "rncoreAutolinkingIos",
  "expoAutolinkingIos",
  "expoAutolinkingAndroid",
  "expoConfigPlugins",
]);

function reasons(source: unknown): string[] {
  if (!source || typeof source !== "object" || !("reasons" in source)) {
    throw new Error("Fingerprint source has no reasons");
  }
  const value = source.reasons;
  if (!Array.isArray(value) || value.some((reason) => typeof reason !== "string")) {
    throw new Error("Fingerprint source reasons are malformed");
  }
  return value;
}

/** Unknown baseline is allowed by policy; malformed diffs must throw, never allow. */
export function productionSafe(baseHash: string | null, headHash: string | null, diff: unknown) {
  if (!baseHash || !headHash || baseHash === headHash) return true;
  if (!Array.isArray(diff)) throw new Error("Fingerprint diff must be an array");
  const allReasons: string[] = [];
  for (const item of diff) {
    if (!item || typeof item !== "object") throw new Error("Invalid fingerprint diff item");
    switch (item.op) {
      case "added":
        allReasons.push(...reasons(item.addedSource));
        break;
      case "removed":
        allReasons.push(...reasons(item.removedSource));
        break;
      case "changed":
        allReasons.push(...reasons(item.beforeSource), ...reasons(item.afterSource));
        break;
      default:
        throw new Error("Unknown fingerprint diff operation");
    }
  }
  return !allReasons.some((reason) => NATIVE_REASONS.has(reason));
}

export function publisherRole(whoami: string, account = "hardmax"): string {
  const line = whoami.split("\n").find((row) => row.trim().startsWith(`• ${account} (Role: `));
  const role = line?.match(/\(Role: (Owner|Admin|Developer|Viewer|Custom)\)/)?.[1];
  if (!role || !["Owner", "Admin", "Developer"].includes(role)) {
    throw new Error(`EAS publisher needs Developer, Admin or Owner access to ${account}`);
  }
  return role;
}

export function releasePlan(input: {
  profile: string;
  platform: string;
  version: string;
  appVersion: string;
  autoSubmit: boolean;
}) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(input.version)) {
    throw new Error("Version must be a release version such as 1.0.0");
  }
  if (input.version !== input.appVersion)
    throw new Error("Version must match apps/mobile/app.json");
  if (!["preview", "production"].includes(input.profile)) throw new Error("Invalid build profile");
  if (!["ios", "android", "all"].includes(input.platform)) throw new Error("Invalid platform");
  if (input.autoSubmit && input.profile !== "production") {
    throw new Error("Auto-submit requires the production store profile");
  }
  return {
    tag: `mobile/v${input.version}`,
    args: [
      "build",
      "--profile",
      input.profile,
      "--platform",
      input.platform,
      "--non-interactive",
      "--wait",
      ...(input.autoSubmit ? ["--auto-submit"] : []),
    ],
  };
}

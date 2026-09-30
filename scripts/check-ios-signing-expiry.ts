import { readIosSigningExpiry } from "../packages/cli/src/services/ios-signing-expiry.ts";

try {
  const entries = await readIosSigningExpiry(process.env.EXPO_ACCESS_TOKEN ?? "");
  for (const entry of entries) {
    console.log(`${entry.name}: expires ${entry.expiresAt}; ${entry.daysLeft} days left`);
  }
  if (entries.some((entry) => entry.daysLeft < 30)) {
    console.error(
      "iOS signing credentials expire in fewer than 30 days; operator renewal is required.",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not check iOS signing expiry");
  process.exitCode = 1;
}

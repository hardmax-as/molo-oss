import { appleSecretDaysLeft } from "../packages/cli/src/services/apple-secret.ts";

// APPLE_CLIENT_SECRET is required; APPLE_APP_CLIENT_SECRET (the bundle id's,
// for native token exchange and revocation) is checked once it exists.
for (const name of ["APPLE_CLIENT_SECRET", "APPLE_APP_CLIENT_SECRET"] as const) {
  try {
    const secret = process.env[name];
    if (!secret) {
      if (name === "APPLE_APP_CLIENT_SECRET") continue;
      throw new Error(`${name} is missing`);
    }
    const daysLeft = appleSecretDaysLeft(secret);
    console.log(`${name}: ${daysLeft} days left`);
    if (daysLeft < 30) {
      console.error(`${name} expires in fewer than 30 days; regenerate and redeploy it.`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : `Could not check ${name} expiry`);
    process.exitCode = 1;
  }
}

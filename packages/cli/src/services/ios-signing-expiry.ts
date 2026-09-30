/** Minimal read-only subset of eas-cli 16.32.0's iOS build-credential query. */
export const IOS_SIGNING_EXPIRY_QUERY = `
  query MoloIosSigningExpiry($projectFullName: String!) {
    app {
      byFullName(fullName: $projectFullName) {
        iosAppCredentials {
          appleAppIdentifier { bundleIdentifier }
          iosAppBuildCredentialsList(filter: { iosDistributionType: APP_STORE }) {
            iosDistributionType
            distributionCertificate { validityNotAfter }
            provisioningProfile { expiration }
          }
        }
      }
    }
  }
`;

export const IOS_BUNDLE = "com.hardmax.molo";
const INVALID = "EAS signing expiry response is missing, ambiguous or malformed";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(INVALID);
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error(INVALID);
  return value;
}

function expiry(name: string, value: unknown, now: Date) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value)) throw new Error(INVALID);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(INVALID);
  return {
    name: `${name} (${IOS_BUNDLE})`,
    expiresAt: new Date(timestamp).toISOString(),
    daysLeft: Math.floor((timestamp - now.getTime()) / 86_400_000),
  };
}

/** Return only safe labels and dates; never return the response or credential IDs. */
export function parseIosSigningExpiry(response: unknown, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error(INVALID);
  const envelope = object(response);
  if (envelope["errors"] !== undefined && list(envelope["errors"]).length) throw new Error(INVALID);
  const app = object(object(object(envelope["data"])["app"])["byFullName"]);
  const matching = list(app["iosAppCredentials"])
    .map(object)
    .filter(
      (credentials) => object(credentials["appleAppIdentifier"])["bundleIdentifier"] === IOS_BUNDLE,
    );
  if (matching.length !== 1) throw new Error(INVALID);
  const builds = list(matching[0]!["iosAppBuildCredentialsList"]).map(object);
  if (builds.length !== 1 || builds[0]!["iosDistributionType"] !== "APP_STORE")
    throw new Error(INVALID);
  const build = builds[0]!;
  return [
    expiry(
      "iOS Distribution certificate",
      object(build["distributionCertificate"])["validityNotAfter"],
      now,
    ),
    expiry(
      "App Store provisioning profile",
      object(build["provisioningProfile"])["expiration"],
      now,
    ),
  ];
}

export async function readIosSigningExpiry(
  token: string,
  request: typeof fetch = fetch,
  now = new Date(),
) {
  if (!token) throw new Error("EXPO_ACCESS_TOKEN is missing");
  try {
    const response = await request("https://api.expo.dev/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: IOS_SIGNING_EXPIRY_QUERY,
        variables: { projectFullName: "@hardmax/molo" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error();
    return parseIosSigningExpiry(await response.json(), now);
  } catch {
    // HTTP, GraphQL and parser errors may echo credentials or response data.
    throw new Error(
      "Could not read EAS signing expiry; check token access and App Store credentials",
    );
  }
}

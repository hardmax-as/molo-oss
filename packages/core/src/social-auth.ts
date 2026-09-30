/** Registration defaults are suggestions only; the server validates the declaration. */
export function registrationCountry(region: string | null | undefined): "NO" | "ZA" | "OTHER" {
  const code = region?.toUpperCase();
  return code === "NO" || code === "ZA" ? code : "OTHER";
}

/** Read an explicit region, never infer residence from the language alone. */
export function registrationCountryFromLanguage(
  language: string | undefined,
): "NO" | "ZA" | "OTHER" {
  if (!language) return "OTHER";
  try {
    return registrationCountry(new Intl.Locale(language).region);
  } catch {
    return "OTHER";
  }
}

/** The social providers Molo offers; `/auth/providers` says which are configured. */
export const SOCIAL_PROVIDERS = ["apple", "google"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

/** Brand names, the same in every language. */
export const SOCIAL_PROVIDER_NAMES: Record<SocialProvider, string> = {
  apple: "Apple",
  google: "Google",
};

export function isSocialProvider(value: unknown): value is SocialProvider {
  return value === "apple" || value === "google";
}

/**
 * The provider's e-mail belongs to an existing Molo account that is not yet
 * connected to the provider, and Better Auth would not link it implicitly
 * (an unverified address on either side). The learner signs in another way
 * and connects the provider in Settings.
 */
export function isUnlinkedSocialAccount(
  error: { code?: string | undefined; message?: string | undefined } | null | undefined,
): boolean {
  return (
    error?.code === "account_not_linked" ||
    (error?.code === "OAUTH_LINK_ERROR" && error.message === "account not linked")
  );
}

export type SocialLinkError = "taken" | "reauth" | "last" | "unverified" | "generic";

/** Maps Better Auth 1.7.2's link, unlink and link-callback codes to the message a learner sees. */
export function socialLinkError(
  error: { code?: string | undefined } | null | undefined,
): SocialLinkError {
  switch (error?.code) {
    case "SOCIAL_ACCOUNT_ALREADY_LINKED":
    case "account_already_linked_to_different_user":
      return "taken";
    case "SESSION_NOT_FRESH":
      return "reauth";
    case "FAILED_TO_UNLINK_LAST_ACCOUNT":
      return "last";
    case "LINKING_NOT_ALLOWED":
      return "unverified";
    default:
      return "generic";
  }
}

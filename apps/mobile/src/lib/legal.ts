import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

/** Public pages; the domain is the one the operator chose (docs/DOMAINS.md). */
export const LEGAL_URLS = {
  privacy: "https://hellomolo.com/privacy",
  terms: "https://hellomolo.com/terms",
} as const;

export type LegalPage = keyof typeof LEGAL_URLS;

/** Opens the page in an in-app browser sheet; never navigates the app itself away. */
export async function openLegal(page: LegalPage): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(LEGAL_URLS[page]);
  } catch {
    // The sheet can be unavailable on some simulators; nothing to recover.
  }
}

/** Routed to the operator by Cloudflare Email Routing (docs/DOMAINS.md). */
export const SUPPORT_EMAIL = "support@hellomolo.com";

/** Opens the mail app addressed to support; with no mail app, nothing happens and the address is shown beside the button. */
export async function openSupport(): Promise<void> {
  try {
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  } catch {
    // No mail client configured; the address is printed under the button.
  }
}

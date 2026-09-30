/**
 * RevenueCat (react-native-purchases 10.9). Configured once at start when a
 * public key exists for the platform; without one every call is a no-op and
 * the Plus screen says "available soon". The server is the source of truth
 * for entitlements (it hears about purchases from the webhook); the app
 * only treats an active `plus` entitlement as unlimited hearts right away.
 * See docs/MONETISATION.md.
 */
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type PurchasesPackage } from "react-native-purchases";

import { hasActivePlus, pickPlusPackages, type PlusPackages } from "./purchases-logic.ts";

export {
  PLUS_ENTITLEMENT,
  PLUS_PRODUCTS,
  hasActivePlus,
  introOffer,
  parsePeriod,
  pickPlusPackages,
} from "./purchases-logic.ts";
export type { PlusPackages } from "./purchases-logic.ts";

function apiKey(): string | null {
  const key =
    Platform.OS === "ios"
      ? process.env["EXPO_PUBLIC_REVENUECAT_IOS_KEY"]
      : process.env["EXPO_PUBLIC_REVENUECAT_ANDROID_KEY"];
  return key && key.trim() !== "" ? key : null;
}

let configured = false;

/** True once the SDK has a key; the Plus screen and hearts consult this. */
export function purchasesEnabled(): boolean {
  return configured;
}

/** Call once at app start. Safe to call again; safe without a key. */
export function configurePurchases(): void {
  if (configured) return;
  const key = apiKey();
  if (!key) return;
  if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: key });
  configured = true;
}

/** Ties the RevenueCat customer to Molo's user id so the webhook's app_user_id matches. */
export async function syncPurchasesUser(userId: string | null): Promise<void> {
  if (!configured) return;
  try {
    if (userId) await Purchases.logIn(userId);
    else await Purchases.logOut();
  } catch {
    // Anonymous state is fine; the next sign-in retries.
  }
}

export async function fetchPlusPackages(): Promise<PlusPackages> {
  if (!configured) return { monthly: null, yearly: null };
  const offerings = await Purchases.getOfferings();
  return pickPlusPackages(offerings.current);
}

/** Runs the store purchase flow. Resolves true when `plus` is active afterwards. */
export async function purchasePlus(pkg: PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return hasActivePlus(customerInfo);
}

export async function restorePlus(): Promise<boolean> {
  if (!configured) return false;
  return hasActivePlus(await Purchases.restorePurchases());
}

export async function currentPlus(): Promise<boolean> {
  if (!configured) return false;
  try {
    return hasActivePlus(await Purchases.getCustomerInfo());
  } catch {
    return false;
  }
}

/**
 * Opens the store's own subscription management (App Store account or
 * Google Play subscriptions), where the learner cancels.
 */
export async function manageSubscription(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.showManageSubscriptions();
  } catch {
    // Nothing to recover: the store sheet was unavailable.
  }
}

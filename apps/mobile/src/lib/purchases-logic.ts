/**
 * The pure part of the RevenueCat integration: product ids and the two
 * decisions the UI makes over SDK objects. No native import here so Jest
 * can cover it without the store.
 */
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from "react-native-purchases";

export const PLUS_ENTITLEMENT = "plus";
/** Store product ids only: the price always comes from the store, never from here (Apple 3.1.2). */
export const PLUS_PRODUCTS = {
  monthly: { id: "molo_plus_monthly" },
  yearly: { id: "molo_plus_yearly" },
} as const;

export function hasActivePlus(info: CustomerInfo | null | undefined): boolean {
  return !!info && PLUS_ENTITLEMENT in info.entitlements.active;
}

export interface PlusPackages {
  monthly: PurchasesPackage | null;
  yearly: PurchasesPackage | null;
}

/** Finds our two products in an offering, whatever package identifiers the dashboard uses. */
export function pickPlusPackages(offering: PurchasesOffering | null | undefined): PlusPackages {
  const byProduct = (id: string) =>
    offering?.availablePackages.find((p) => p.product.identifier === id) ?? null;
  return {
    monthly: byProduct(PLUS_PRODUCTS.monthly.id) ?? offering?.monthly ?? null,
    yearly: byProduct(PLUS_PRODUCTS.yearly.id) ?? offering?.annual ?? null,
  };
}

export type PeriodUnit = "day" | "week" | "month" | "year";
export interface Period {
  unit: PeriodUnit;
  count: number;
}

/** Reads an ISO 8601 period as the store gives it ("P1M", "P1Y", "P7D", "P2W"); null when it cannot. */
export function parsePeriod(iso: string | null | undefined): Period | null {
  const m = /^P(\d+)([DWMY])$/.exec(iso ?? "");
  if (!m) return null;
  const unit = ({ D: "day", W: "week", M: "month", Y: "year" } as const)[
    m[2] as "D" | "W" | "M" | "Y"
  ];
  return { unit, count: Number(m[1]) };
}

/**
 * What the paywall must say about an introductory offer, if the store has
 * one: a free trial, or a reduced first period. Null when there is none, so
 * the screen never mentions a trial the store will not give.
 */
export function introOffer(
  intro: { price: number; priceString: string; period: string; cycles: number } | null | undefined,
): { free: boolean; priceString: string; period: Period } | null {
  if (!intro) return null;
  const period = parsePeriod(intro.period);
  if (!period) return null;
  return {
    free: intro.price === 0,
    priceString: intro.priceString,
    period: { unit: period.unit, count: period.count * Math.max(1, intro.cycles) },
  };
}

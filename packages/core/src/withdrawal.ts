import { Schema } from "effect";

export const WEB_CONSENT_VERSION = "2026-09-20";
export const WebCheckoutRequest = Schema.Struct({
  productId: Schema.Literal("molo_plus_monthly", "molo_plus_yearly"),
  expressStart: Schema.Literal(true),
});
export const WithdrawalRequest = Schema.Struct({ purchaseId: Schema.UUID });
export const RevenueCatEvent = Schema.Struct({
  id: Schema.String.pipe(Schema.minLength(1)),
  type: Schema.String,
  app_user_id: Schema.String.pipe(Schema.minLength(1)),
  entitlement_ids: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  product_id: Schema.optional(Schema.NullOr(Schema.String)),
  new_product_id: Schema.optional(Schema.NullOr(Schema.String)),
  expiration_at_ms: Schema.optional(Schema.NullOr(Schema.NonNegativeInt)),
  purchased_at_ms: Schema.optional(Schema.NullOr(Schema.NonNegativeInt)),
  event_timestamp_ms: Schema.optional(Schema.NonNegativeInt),
  original_transaction_id: Schema.optional(Schema.NullOr(Schema.String)),
  transaction_id: Schema.optional(Schema.NullOr(Schema.String)),
  price_in_purchased_currency: Schema.optional(Schema.NullOr(Schema.Finite)),
  currency: Schema.optional(Schema.NullOr(Schema.String)),
  store: Schema.optional(Schema.NullOr(Schema.String)),
  environment: Schema.optional(Schema.NullOr(Schema.String)),
});
export type RevenueCatEvent = typeof RevenueCatEvent.Type;
export const isWebStore = (store: string | null | undefined) =>
  store === "RC_BILLING" || store === "STRIPE";

const DAY = 86_400_000;
const osloDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function calendarDate(date: Date) {
  const parts = osloDate.formatToParts(date);
  const part = (kind: string) => Number(parts.find((p) => p.type === kind)?.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}
/** Gregorian Easter; used only to extend deadlines over Norwegian public holidays. */
function easter(year: number): Date {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100;
  const d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return new Date(Date.UTC(year, Math.floor(n / 31) - 1, (n % 31) + 1));
}
function nonWorkingDay(day: Date): boolean {
  if ([0, 6].includes(day.getUTCDay())) return true;
  if (["01-01", "05-01", "05-17", "12-25", "12-26"].includes(day.toISOString().slice(5, 10)))
    return true;
  const distance = (day.getTime() - easter(day.getUTCFullYear()).getTime()) / DAY;
  return [-3, -2, 1, 39, 50].includes(distance);
}
/** Exclusive end of the 14th calendar day after purchase, extended to a working day (Oslo). */
export function withdrawalDeadline(purchasedAt: Date): Date {
  const last = calendarDate(purchasedAt);
  last.setUTCDate(last.getUTCDate() + 14);
  while (nonWorkingDay(last)) last.setUTCDate(last.getUTCDate() + 1);
  const nextMidnight = new Date(last.getTime() + DAY);
  // Noon safely tells us the offset of that date; Oslo's DST transition is after midnight.
  const zone = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Oslo",
    timeZoneName: "shortOffset",
  });
  const offsetText =
    zone.formatToParts(last).find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const hours = Number(offsetText.replace("GMT", ""));
  return new Date(nextMidnight.getTime() - hours * 3_600_000);
}
export function canWithdraw(purchasedAt: Date, now: Date): boolean {
  return now >= purchasedAt && now < withdrawalDeadline(purchasedAt);
}
/** Currency-rounded estimate; the operator verifies the actual payment before refunding. */
export function withdrawalRefund(
  price: number | null,
  currency: string | null,
  start: Date,
  end: Date | null,
  now: Date,
  expressStart: boolean,
): number | null {
  if (
    price === null ||
    !Number.isFinite(price) ||
    price < 0 ||
    !currency ||
    !/^[A-Z]{3}$/.test(currency)
  )
    return null;
  const duration = end ? end.getTime() - start.getTime() : 0;
  if (expressStart && duration <= 0) return null;
  const unused = expressStart
    ? Math.max(0, Math.min(1, 1 - (now.getTime() - start.getTime()) / duration))
    : 1;
  const digits =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const scale = 10 ** digits;
  return Math.round(price * unused * scale) / scale;
}
export interface WebPurchaseView {
  readonly id: string;
  readonly productId: string;
  readonly purchasedAt: string;
  readonly deadline: string;
  readonly eligible: boolean;
  readonly requestedAt: string | null;
  readonly resolvedAt: string | null;
  readonly refundEstimate: number | null;
  readonly currency: string | null;
}

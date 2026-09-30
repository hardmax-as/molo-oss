import type { SourceLang } from "./content.ts";
import type { RevenueCatEvent } from "./withdrawal.ts";

export interface MemberNotification {
  readonly name: string;
  readonly memberNumber: number;
  readonly provider: "apple" | "google" | "email";
  readonly sourceLang: SourceLang;
}

/** Escape Slack control characters; never let names mention a channel or link. */
function plain(value: string): string {
  return value
    .replace(/[\r\n\t]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function memberNotificationText(member: MemberNotification): string {
  // Some providers use an email as the name. Never send that fallback to Slack.
  const first = member.name.trim().split(/\s+/)[0] ?? "";
  const name = !first || first.includes("@") ? "Learner" : plain(first).slice(0, 80);
  return `:wave: New member — ${name} · member #${member.memberNumber} overall · via ${member.provider} · learns from ${member.sourceLang}`;
}

const subscriptionLabels: Readonly<Record<string, string>> = {
  INITIAL_PURCHASE: ":tada: New Molo Plus",
  RENEWAL: ":arrows_counterclockwise: Molo Plus renewed",
  CANCELLATION: ":pause_button: Molo Plus cancelled",
  UNCANCELLATION: ":tada: Molo Plus resumed",
  EXPIRATION: ":hourglass: Molo Plus expired",
  BILLING_ISSUE: ":warning: Molo Plus billing issue",
  PRODUCT_CHANGE: ":arrows_counterclockwise: Molo Plus product changed",
};

export function isPlusNotificationEvent(event: RevenueCatEvent): boolean {
  return (
    Object.hasOwn(subscriptionLabels, event.type) &&
    // Matches applyRevenueCatEvent: absent/empty entitlement IDs default to Plus.
    (!event.entitlement_ids?.length || event.entitlement_ids.includes("plus"))
  );
}

function productLabel(id: string | null | undefined): string {
  return id === "molo_plus_yearly"
    ? "yearly"
    : id === "molo_plus_monthly"
      ? "monthly"
      : plain(id ?? "unknown product");
}

export function subscriptionNotificationText(
  event: RevenueCatEvent,
  activePlus: number,
): string | null {
  if (!isPlusNotificationEvent(event)) return null;
  const product =
    productLabel(event.product_id) +
    (event.type === "PRODUCT_CHANGE" && event.new_product_id
      ? ` → ${productLabel(event.new_product_id)}`
      : "");
  const amount = event.price_in_purchased_currency;
  const currency = event.currency;
  const price =
    amount != null && Number.isFinite(amount) && currency && /^[A-Z]{3}$/.test(currency)
      ? ` (${new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" }).format(amount)})`
      : "";
  const store =
    event.store === "APP_STORE"
      ? "App Store"
      : event.store === "PLAY_STORE"
        ? "Play"
        : plain(event.store ?? "unknown store");
  const prefix = event.environment === "SANDBOX" ? "[sandbox] " : "";
  return `${prefix}${subscriptionLabels[event.type]} — ${product}${price} · ${store} · Plus members: ${activePlus}`;
}

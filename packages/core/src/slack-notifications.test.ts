import { describe, expect, it } from "vitest";

import { memberNotificationText, subscriptionNotificationText } from "./slack-notifications.ts";
import type { RevenueCatEvent } from "./withdrawal.ts";

const event: RevenueCatEvent = {
  id: "event-1",
  type: "INITIAL_PURCHASE",
  app_user_id: "private-user-id",
  product_id: "molo_plus_yearly",
  store: "APP_STORE",
  currency: "USD",
  price_in_purchased_currency: 49.99,
};

describe("Slack messages", () => {
  it("uses only the first name and reports provider, language and ordinal", () => {
    expect(
      memberNotificationText({
        name: "  Alex Example ",
        memberNumber: 84,
        provider: "apple",
        sourceLang: "nb",
      }),
    ).toBe(":wave: New member — Alex · member #84 overall · via apple · learns from nb");
  });
  it.each(["", "member@gmail.com", "<mailto:member@gmail.com|Member>"])(
    "does not expose email-like names: %s",
    (name) => {
      expect(
        memberNotificationText({ name, memberNumber: 1, provider: "email", sourceLang: "en" }),
      ).toContain("— Learner ·");
    },
  );
  it("escapes Slack mentions", () => {
    expect(
      memberNotificationText({
        name: "<!channel>",
        memberNumber: 1,
        provider: "google",
        sourceLang: "en",
      }),
    ).toContain("&lt;!channel&gt;");
  });
  it.each([
    ["INITIAL_PURCHASE", "New Molo Plus"],
    ["RENEWAL", "Molo Plus renewed"],
    ["CANCELLATION", "Molo Plus cancelled"],
    ["UNCANCELLATION", "Molo Plus resumed"],
    ["EXPIRATION", "Molo Plus expired"],
    ["BILLING_ISSUE", "Molo Plus billing issue"],
    ["PRODUCT_CHANGE", "Molo Plus product changed"],
  ])("maps %s", (type, label) => {
    const text = subscriptionNotificationText({ ...event, type }, 12)!;
    expect(text).toContain(label);
    expect(text).toMatch(/yearly \(USD\s49.99\) · App Store · Plus members: 12/);
    expect(text).not.toContain(event.app_user_id);
  });
  it("shows sandbox, Play, monthly, zero-price trials and product changes", () => {
    expect(
      subscriptionNotificationText(
        {
          ...event,
          type: "PRODUCT_CHANGE",
          environment: "SANDBOX",
          store: "PLAY_STORE",
          product_id: "molo_plus_monthly",
          new_product_id: "molo_plus_yearly",
          price_in_purchased_currency: 0,
        },
        3,
      ),
    ).toMatch(/^\[sandbox\].*monthly → yearly \(USD\s0.00\) · Play · Plus members: 3$/);
  });
  it("omits unknown prices, never guessing USD", () => {
    expect(subscriptionNotificationText({ ...event, currency: null }, 0)).toContain(
      "yearly · App Store",
    );
    expect(
      subscriptionNotificationText({ ...event, price_in_purchased_currency: null }, 0),
    ).toContain("yearly · App Store");
  });
  it.each(["TEST", "TRANSFER", "toString", "unknown"])("ignores %s", (type) => {
    expect(subscriptionNotificationText({ ...event, type }, 1)).toBeNull();
  });
  it("ignores unrelated entitlements", () => {
    expect(subscriptionNotificationText({ ...event, entitlement_ids: ["other"] }, 1)).toBeNull();
  });
});

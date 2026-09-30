import { hasActivePlus, introOffer, parsePeriod, pickPlusPackages } from "./purchases-logic";

const pkg = (packageId: string, productId: string) =>
  ({ identifier: packageId, product: { identifier: productId } }) as never;

describe("pickPlusPackages", () => {
  it("finds the products by store identifier regardless of package names", () => {
    const offering = {
      availablePackages: [
        pkg("$rc_monthly", "molo_plus_monthly"),
        pkg("custom_year", "molo_plus_yearly"),
      ],
      monthly: null,
      annual: null,
    } as never;
    const picked = pickPlusPackages(offering);
    expect(picked.monthly?.identifier).toBe("$rc_monthly");
    expect(picked.yearly?.identifier).toBe("custom_year");
  });
  it("falls back to the offering's monthly and annual slots, and to nulls", () => {
    const offering = {
      availablePackages: [],
      monthly: pkg("m", "other_monthly"),
      annual: pkg("y", "other_yearly"),
    } as never;
    expect(pickPlusPackages(offering).monthly?.identifier).toBe("m");
    expect(pickPlusPackages(null)).toEqual({ monthly: null, yearly: null });
  });
});

describe("hasActivePlus", () => {
  it("reads the active entitlements map", () => {
    expect(hasActivePlus({ entitlements: { active: { plus: {} } } } as never)).toBe(true);
    expect(hasActivePlus({ entitlements: { active: {} } } as never)).toBe(false);
    expect(hasActivePlus(null)).toBe(false);
  });
});

describe("store periods and introductory offers", () => {
  it("reads the ISO periods the stores use", () => {
    expect(parsePeriod("P1M")).toEqual({ unit: "month", count: 1 });
    expect(parsePeriod("P1Y")).toEqual({ unit: "year", count: 1 });
    expect(parsePeriod("P7D")).toEqual({ unit: "day", count: 7 });
    expect(parsePeriod("P1Y2M")).toBeNull();
    expect(parsePeriod(null)).toBeNull();
  });
  it("describes a free trial and a paid intro, and nothing when there is none", () => {
    expect(introOffer({ price: 0, priceString: "0 kr", period: "P1W", cycles: 1 })).toEqual({
      free: true,
      priceString: "0 kr",
      period: { unit: "week", count: 1 },
    });
    expect(introOffer({ price: 19, priceString: "19 kr", period: "P1M", cycles: 3 })).toEqual({
      free: false,
      priceString: "19 kr",
      period: { unit: "month", count: 3 },
    });
    expect(introOffer(null)).toBeNull();
  });
});

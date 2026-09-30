import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";

import { LegalLinks } from "~/components/LegalLinks.tsx";
import { SaveProgressWall } from "~/components/SaveProgressWall.tsx";
import { useAnnounce } from "~/lib/announce.ts";
import { useT } from "~/lib/i18n.tsx";
import { usePlus } from "~/lib/plus.tsx";
import {
  fetchPlusPackages,
  introOffer,
  manageSubscription,
  parsePeriod,
  purchasePlus,
  purchasesEnabled,
  restorePlus,
} from "~/lib/purchases.ts";
import { useMe } from "~/lib/session.tsx";
import { useGuest } from "~/lib/use-guest.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { haptic } from "~/ui/haptics.ts";
import { Crane } from "~/ui/Mascots.tsx";
import { useSfx } from "~/ui/sfx.tsx";

type Which = "monthly" | "yearly";

/** Text-presentation glyphs (never colour emoji) so the perk badges stay in the palette. */
const PERK_GLYPHS = { hearts: "∞", freeze: "❄︎", offline: "↓", support: "♥︎" } as const;

/**
 * Molo Plus: unlimited hearts and the perks (docs/MONETISATION.md). Every
 * price, period and introductory offer comes from the store through
 * RevenueCat; when the store has nothing to offer the screen says so rather
 * than showing a price of its own (Apple 3.1.2). The auto-renewal terms,
 * the Terms of Use and the privacy policy sit under the prices, and Restore
 * is always there for an account. Nothing here points to the web checkout.
 * The server learns about purchases from the webhook; the app only lifts
 * the hearts gate locally right away.
 */
export default function PlusScreen() {
  const t = useT();
  const me = useMe();
  const guest = useGuest();
  const router = useRouter();
  const qc = useQueryClient();
  const sfx = useSfx();
  const { plan, localPlus, setLocalPlus } = usePlus();
  const enabled = purchasesEnabled();
  const [message, setMessage] = useState<string | null>(null);
  // Same as everywhere else: iOS does not read a live region.
  useAnnounce(message);
  const packages = useQuery({
    queryKey: ["plus-packages"],
    queryFn: fetchPlusPackages,
    enabled,
    staleTime: 5 * 60_000,
  });

  const afterPurchase = async (active: boolean) => {
    if (!active) return;
    setLocalPlus(true);
    sfx.play("level_up");
    void haptic.success();
    setMessage(t("plus.thanks"));
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["me"] }),
      qc.invalidateQueries({ queryKey: ["progress"] }),
      qc.invalidateQueries({ queryKey: ["hearts"] }),
    ]);
  };
  const buy = useMutation({
    mutationFn: (pkg: PurchasesPackage) => purchasePlus(pkg),
    onSuccess: afterPurchase,
    onError: (e) => setMessage(e instanceof Error ? e.message : t("common.error")),
  });
  const restore = useMutation({
    mutationFn: restorePlus,
    onSuccess: (active) => {
      if (active) void afterPurchase(true);
      else setMessage(t("plus.nothingToRestore"));
    },
    onError: (e) => setMessage(e instanceof Error ? e.message : t("common.error")),
  });

  // Plus is for accounts: a guest with XP to keep sees the wall instead of the prices.
  if (guest.walled)
    return (
      <ScrollView className="flex-1 bg-sand" contentContainerClassName="p-5 pb-12">
        <SaveProgressWall xp={guest.xp} lessons={guest.lessons} />
      </ScrollView>
    );

  const perks = ["hearts", "freeze", "offline", "support"] as const;
  const options: { which: Which; pkg: PurchasesPackage }[] = [];
  if (packages.data?.yearly) options.push({ which: "yearly", pkg: packages.data.yearly });
  if (packages.data?.monthly) options.push({ which: "monthly", pkg: packages.data.monthly });
  const loading = enabled && packages.isPending;
  // "Two months free" only when the store's own prices make it true.
  const monthly = packages.data?.monthly?.product.price;
  const yearly = packages.data?.yearly?.product.price;
  const yearlyIsDeal = monthly !== undefined && yearly !== undefined && yearly <= monthly * 10;

  /** "79 kr / month", from the store's period when it gives one. */
  const priceLine = (which: Which, pkg: PurchasesPackage) => {
    const unit = parsePeriod(pkg.product.subscriptionPeriod)?.unit;
    const perYear = unit ? unit === "year" : which === "yearly";
    return t(perYear ? "plus.perYear" : "plus.perMonth", { price: pkg.product.priceString });
  };
  const offerLine = (which: Which, pkg: PurchasesPackage) => {
    const offer = introOffer(pkg.product.introPrice);
    if (!offer) return null;
    const period = t(`plus.period.${offer.period.unit}`, { count: offer.period.count });
    const price = priceLine(which, pkg);
    return offer.free
      ? t("plus.trial", { period, price })
      : t("plus.intro", { intro: offer.priceString, period, price });
  };

  return (
    <ScrollView className="flex-1 bg-sand" contentContainerClassName="p-5 pb-12 gap-4">
      <View className="flex-row items-center gap-3">
        <Text className="flex-1 font-display text-xl text-indigo">{t("plus.body")}</Text>
        <Crane pose="hello" size={110} />
      </View>

      <Card index={0}>
        <Text className="mb-3 font-display text-lg text-indigo">{t("plus.included")}</Text>
        <View className="gap-4">
          {perks.map((key) => (
            <View key={key} className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-sun">
                <Text className="font-display-bold text-xl text-indigo">{PERK_GLYPHS[key]}</Text>
              </View>
              <View className="flex-1">
                <Text className="font-display text-base text-indigo">
                  {t(`plus.perks.${key}.title`)}
                </Text>
                <Text className="font-body text-sm text-mist">{t(`plus.perks.${key}.body`)}</Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      {plan === "plus" ? (
        <Card tone="indigo" index={1}>
          <Text className="font-display text-xl text-cloud">✓ {t("plus.active")}</Text>
          {me.data?.plan?.expiresAt && (
            <Text className="mt-1 font-body text-sm text-cloud/80">
              {t("plus.renews", { date: me.data.plan.expiresAt.slice(0, 10) })}
            </Text>
          )}
        </Card>
      ) : options.length === 0 ? (
        <Card index={1}>
          <Text className="font-body-semibold text-base text-ink" testID="plus-unavailable">
            {loading ? t("common.loading") : t("plus.unavailable")}
          </Text>
          {enabled && !loading && (
            <View className="mt-3 items-start">
              <Button
                label={t("common.retry")}
                variant="cloud"
                onPress={() => void packages.refetch()}
                testID="plus-retry"
              />
            </View>
          )}
        </Card>
      ) : (
        options.map(({ which, pkg }) => {
          const offer = offerLine(which, pkg);
          return (
            <Pressable
              key={which}
              accessibilityRole="button"
              disabled={buy.isPending || !me.data}
              onPress={() => {
                void haptic.tap();
                buy.mutate(pkg);
              }}
              className={`rounded-4xl p-5 ${which === "yearly" ? "bg-indigo" : "bg-cloud"}`}
              testID={`plus-${which}`}
            >
              <Text
                className={`font-display text-lg ${which === "yearly" ? "text-cloud" : "text-indigo"}`}
              >
                {t(`plus.${which}`)}
              </Text>
              <Text
                className={`my-1 font-display-bold text-3xl ${which === "yearly" ? "text-sun" : "text-indigo"}`}
              >
                {priceLine(which, pkg)}
              </Text>
              {offer && (
                <Text
                  className={`font-body-semibold text-sm ${which === "yearly" ? "text-cloud" : "text-ink"}`}
                  testID={`plus-offer-${which}`}
                >
                  {offer}
                </Text>
              )}
              {which === "yearly" && yearlyIsDeal && (
                <Text className="font-body-semibold text-sm text-sun">{t("plus.yearlyNote")}</Text>
              )}
              <View className="mt-3">
                {!me.data ? (
                  <Button
                    label={t("nav.signIn")}
                    variant={which === "yearly" ? "sun" : "indigo"}
                    full
                    onPress={() => router.push("/auth")}
                  />
                ) : (
                  <Button
                    label={buy.isPending ? t("common.loading") : t("plus.cta")}
                    variant={which === "yearly" ? "sun" : "indigo"}
                    full
                    disabled={buy.isPending}
                    onPress={() => buy.mutate(pkg)}
                    testID={`plus-buy-${which}`}
                  />
                )}
              </View>
            </Pressable>
          );
        })
      )}

      {message && (
        <Text
          className="text-center font-body-semibold text-sm text-indigo"
          accessibilityLiveRegion="polite"
          testID="plus-message"
        >
          {message}
        </Text>
      )}
      {enabled && me.data && (
        <View className="items-center">
          {plan === "plus" && localPlus ? (
            <Button
              label={t("plus.manage")}
              variant="ghost"
              onPress={() => void manageSubscription()}
              testID="plus-manage"
            />
          ) : (
            <Button
              label={restore.isPending ? t("common.loading") : t("plus.restore")}
              variant="ghost"
              disabled={restore.isPending}
              onPress={() => restore.mutate()}
              testID="plus-restore"
            />
          )}
        </View>
      )}
      {/* Apple 3.1.2: the renewal terms and both documents, next to the prices. */}
      <Text className="font-body text-xs text-mist" testID="plus-disclosure">
        {Platform.OS === "ios" ? t("plus.disclosureIos") : t("plus.disclosureAndroid")}
      </Text>
      <LegalLinks />
    </ScrollView>
  );
}

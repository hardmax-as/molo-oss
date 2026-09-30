import { PLUS_ENTITLEMENT, PLUS_PRODUCTS } from "@molo/core";
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, Heart, Infinity as InfinityIcon, Snowflake, WifiOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Crane } from "~/components/illustrations/Crane.tsx";
import { Button, ButtonLink } from "~/components/ui/Button.tsx";
import { WebWithdrawals } from "~/components/WebWithdrawals.tsx";
import { recordWebCheckout } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";

export const Route = createFileRoute("/plus")({ component: PlusPage });

const WEB_KEY = (import.meta.env["VITE_REVENUECAT_WEB_KEY"] as string | undefined) ?? "";

/**
 * Molo Plus: unlimited hearts and the perks. Purchases go through
 * RevenueCat Web Billing when a public key is configured; the server learns
 * about them from the webhook, never from this page.
 */
function PlusPage() {
  const t = useT();
  const me = useMe();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"monthly" | "yearly" | null>(null);
  const [expressStart, setExpressStart] = useState(false);
  const plan = me.data?.plan.plan ?? "free";
  const canCheckout = me.data?.user.country === "NO";
  // Three different situations, not one "store only" (W13): a guest's
  // country is simply not known yet and gets a way to sign in; an account
  // with no recorded country is told so; only a known country outside
  // Norway is sent to the stores.
  const audience = me.isPending
    ? "pending"
    : !me.data
      ? "guest"
      : canCheckout
        ? "checkout"
        : me.data.user.country
          ? "stores"
          : "noCountry";

  async function buy(which: "monthly" | "yearly") {
    if (!me.data || !canCheckout || !expressStart) return;
    setBusy(which);
    try {
      const { Purchases } = await import("@revenuecat/purchases-js");
      const purchases = Purchases.isConfigured()
        ? Purchases.getSharedInstance()
        : Purchases.configure({ apiKey: WEB_KEY, appUserId: me.data.user.id });
      if (purchases.getAppUserId() !== me.data.user.id) await purchases.changeUser(me.data.user.id);
      const offerings = await purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find(
        (p) => p.webBillingProduct.identifier === PLUS_PRODUCTS[which].id,
      );
      if (!pkg) throw new Error(t("plus.noOffer"));
      const consent = await recordWebCheckout(PLUS_PRODUCTS[which].id);
      const { customerInfo } = await purchases.purchase({
        rcPackage: pkg,
        metadata: { molo_consent_id: consent.id, molo_consent_version: consent.version },
      });
      if (PLUS_ENTITLEMENT in customerInfo.entitlements.active) {
        toast.success(t("plus.thanks"));
        await qc.invalidateQueries({ queryKey: ["me"] });
        await qc.invalidateQueries({ queryKey: ["progress"] });
        await qc.invalidateQueries({ queryKey: ["hearts"] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  const perks = [
    { Icon: InfinityIcon, key: "hearts" },
    { Icon: Snowflake, key: "freeze" },
    { Icon: WifiOff, key: "offline" },
    { Icon: Heart, key: "support" },
  ] as const;

  return (
    <section className="mx-auto max-w-2xl">
      <div className="flex flex-col items-center gap-2 text-center">
        <Crane pose="hello" size={140} />
        <h1 className="font-display text-4xl font-bold text-indigo">{t("plus.title")}</h1>
        <p className="max-w-md text-mist">{t("plus.body")}</p>
      </div>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {perks.map(({ Icon, key }) => (
          <li key={key} className="flex gap-3 rounded-3xl bg-cloud p-4 shadow-card">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sun text-indigo">
              <Icon size={22} aria-hidden />
            </span>
            <span>
              <span className="block font-display font-semibold text-indigo">
                {t(`plus.perks.${key}.title`)}
              </span>
              <span className="block text-sm text-mist">{t(`plus.perks.${key}.body`)}</span>
            </span>
          </li>
        ))}
      </ul>

      {canCheckout && plan !== "plus" && WEB_KEY && (
        <div className="mt-8 space-y-3 rounded-3xl bg-cloud p-5">
          <label className="flex items-start gap-3 text-sm text-indigo">
            <input
              type="checkbox"
              required
              checked={expressStart}
              disabled={busy !== null}
              onChange={(event) => setExpressStart(event.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-sea"
            />
            {t("withdrawal.expressStart")}
          </label>
          <Link to="/withdrawal-form" className="text-sm underline">
            {t("withdrawal.form")}
          </Link>
          <p className="text-sm text-mist">{t("withdrawal.how")}</p>
        </div>
      )}
      {plan === "plus" ? (
        <div className="mt-8 rounded-3xl bg-indigo p-6 text-center text-white">
          <Check className="mx-auto mb-2 text-sun" aria-hidden />
          <p className="font-display text-xl font-semibold">{t("plus.active")}</p>
          {me.data?.plan.expiresAt && (
            <p className="text-sm text-white/70">
              {t("plus.renews", { date: me.data.plan.expiresAt.slice(0, 10) })}
            </p>
          )}
        </div>
      ) : audience === "pending" ? (
        <p className="mt-8 text-center text-mist">{t("common.loading")}</p>
      ) : audience === "stores" || audience === "noCountry" ? (
        <p
          className="mt-8 rounded-3xl bg-cloud p-6 text-center text-indigo"
          data-testid="plus-stores"
        >
          {t(audience === "stores" ? "plus.appStoresOnly" : "plus.noCountry")}
        </p>
      ) : (
        <>
          {audience === "guest" && (
            <p className="mt-8 text-center text-indigo" data-testid="plus-guest">
              {t("plus.guestNote")}
            </p>
          )}
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {(["yearly", "monthly"] as const).map((which) => (
              <div
                key={which}
                className={`rounded-3xl p-6 text-center shadow-card ${which === "yearly" ? "bg-indigo text-white" : "bg-cloud text-indigo"}`}
              >
                <p className="font-display text-lg font-semibold">{t(`plus.${which}`)}</p>
                <p className="my-2 font-display text-4xl font-bold">
                  {t("plus.price", { nok: PLUS_PRODUCTS[which].nok })}
                </p>
                {which === "yearly" && <p className="text-sm text-sun">{t("plus.yearlyNote")}</p>}
                {me.data ? (
                  WEB_KEY ? (
                    <Button
                      size="lg"
                      className="mt-4 w-full"
                      variant={which === "yearly" ? "primary" : "indigo"}
                      disabled={busy !== null || !expressStart}
                      onClick={() => void buy(which)}
                    >
                      {busy === which ? t("common.loading") : t("plus.cta")}
                    </Button>
                  ) : (
                    <p
                      className={`mt-4 text-sm ${which === "yearly" ? "text-white/70" : "text-mist"}`}
                    >
                      {t("plus.soon")}
                    </p>
                  )
                ) : (
                  <ButtonLink
                    to="/auth"
                    size="lg"
                    className="mt-4 w-full"
                    variant={which === "yearly" ? "primary" : "indigo"}
                  >
                    {t("auth.signIn")}
                  </ButtonLink>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {me.data && (
        <div className="mt-6">
          <WebWithdrawals />
        </div>
      )}
      <p className="mt-6 text-center text-xs text-mist">{t("plus.fine")}</p>
    </section>
  );
}

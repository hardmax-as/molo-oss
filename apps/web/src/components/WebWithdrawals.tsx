import type { WebPurchaseView } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/Button.tsx";
import { getWebPurchases, withdrawWebPurchase } from "~/lib/api.ts";
import { useLang, useT } from "~/lib/i18n.tsx";

export function WebWithdrawals() {
  const t = useT();
  const { lang } = useLang();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<string | null>(null);
  const purchases = useQuery({ queryKey: ["web-purchases"], queryFn: getWebPurchases });
  const request = useMutation({
    mutationFn: withdrawWebPurchase,
    onSuccess: async () => {
      setConfirm(null);
      toast.success(t("withdrawal.received"));
      await Promise.all(
        ["web-purchases", "me", "hearts", "progress"].map((key) =>
          qc.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
    onError: () => {
      toast.error(t("withdrawal.error"));
      void qc.invalidateQueries({ queryKey: ["web-purchases"] });
    },
  });
  function receipt(row: WebPurchaseView) {
    const text = `${t("withdrawal.received")}\n${t("withdrawal.receiptDetails", { id: row.id, product: row.productId, purchasedAt: row.purchasedAt, requestedAt: row.requestedAt })}\n${row.resolvedAt ? t("withdrawal.refunded") : t("withdrawal.pending")}\nsupport@hellomolo.com\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `molo-withdrawal-${row.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const date = (value: string) => new Date(value).toLocaleString(lang === "nb" ? "nb-NO" : "en-GB");
  return (
    <section className="space-y-3" aria-label={t("withdrawal.title")}>
      <h3 className="font-display text-lg font-semibold text-indigo">{t("withdrawal.title")}</h3>
      <p className="text-sm text-mist">{t("withdrawal.how")}</p>
      {purchases.isPending && <p>{t("common.loading")}</p>}
      {purchases.isError && (
        <p role="alert" className="text-coral-deep">
          {t("common.error")}
        </p>
      )}
      {purchases.data?.purchases.map((row) => (
        <div key={row.id} className="space-y-3 rounded-2xl border border-mist-soft p-4">
          <p className="text-sm font-semibold">
            {t("withdrawal.purchase", { date: date(row.purchasedAt) })}
          </p>
          {row.requestedAt ? (
            <>
              <p role="status" className="text-sm">
                {row.resolvedAt ? t("withdrawal.refunded") : t("withdrawal.pending")}
              </p>
              <Button variant="outline" size="sm" onClick={() => receipt(row)}>
                {t("withdrawal.receipt")}
              </Button>
            </>
          ) : row.eligible ? (
            <>
              <p className="text-sm">
                {t("withdrawal.deadline", {
                  date: date(new Date(new Date(row.deadline).getTime() - 1).toISOString()),
                })}
              </p>
              <p className="text-sm text-mist">
                {row.refundEstimate !== null && row.currency
                  ? t("withdrawal.estimate", {
                      amount: new Intl.NumberFormat(lang === "nb" ? "nb-NO" : "en-GB", {
                        style: "currency",
                        currency: row.currency,
                      }).format(row.refundEstimate),
                    })
                  : t("withdrawal.estimateUnknown")}
              </p>
              {confirm === row.id ? (
                <div className="space-y-3">
                  <p>{t("withdrawal.confirmBody")}</p>
                  <Button
                    variant="coral"
                    disabled={request.isPending}
                    onClick={() => request.mutate(row.id)}
                  >
                    {t("withdrawal.confirm")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={request.isPending}
                    onClick={() => setConfirm(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setConfirm(row.id)}>
                  {t("withdrawal.start")}
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-mist">{t("withdrawal.expired")}</p>
          )}
        </div>
      ))}
      <p className="text-sm text-mist">
        {t("withdrawal.missing")}{" "}
        <a className="underline" href="mailto:support@hellomolo.com">
          support@hellomolo.com
        </a>
      </p>
      <Link to="/withdrawal-form" className="text-sm underline">
        {t("withdrawal.form")}
      </Link>
    </section>
  );
}

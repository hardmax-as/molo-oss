import { nameAllowed, type LeagueProfile } from "@molo/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { putLeagueProfile } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";

export function LeagueSettings({ profile }: { profile: LeagueProfile }) {
  const t = useT();
  const qc = useQueryClient();
  const [name, setName] = useState(profile.displayName ?? "");
  const [optOut, setOptOut] = useState(profile.leaguesOptOut);
  // The API refuses the same names (packages/core name-filter); saying so here explains why.
  const refused = name.trim() !== "" && !nameAllowed(name.trim());
  const save = useMutation({
    mutationFn: () => putLeagueProfile({ displayName: name.trim() || null, leaguesOptOut: optOut }),
    onSuccess: async () => {
      toast.success(t("settings.saved"));
      await Promise.all(
        ["me", "league", "league-history"].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      );
    },
    onError: () => toast.error(t("common.error")),
  });
  return (
    <Card index={2}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <h3 className="font-display text-lg font-semibold text-indigo">
          {t("leagueSettings.title")}
        </h3>
        <label className="block text-sm font-semibold text-indigo">
          {t("leagueSettings.displayName")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            autoComplete="nickname"
            aria-describedby="league-name-hint"
            aria-invalid={refused}
            className="mt-1 w-full rounded-2xl border-2 border-mist-soft bg-cloud px-4 py-3 text-base text-ink"
          />
        </label>
        <p id="league-name-hint" className="text-sm text-mist">
          {t("leagueSettings.nameHint")}
        </p>
        {refused && (
          <p role="alert" className="text-sm font-semibold text-coral-deep">
            {t("leagueSettings.nameNotAllowed")}
          </p>
        )}
        <label className="flex items-center gap-3 text-sm font-semibold text-indigo">
          <input
            type="checkbox"
            checked={optOut}
            onChange={(event) => setOptOut(event.target.checked)}
            className="h-5 w-5 accent-sea"
          />
          {t("leagueSettings.optOut")}
        </label>
        <p className="text-sm text-mist">{t("leagueSettings.optOutHint")}</p>
        <Button type="submit" disabled={save.isPending || refused} variant="indigo">
          {t("leagueSettings.save")}
        </Button>
      </form>
    </Card>
  );
}

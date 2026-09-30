import { nameAllowed, type LeagueProfile } from "@molo/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { putLeagueProfile } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Switch } from "~/ui/Switch.tsx";

export function LeagueSettings({ profile }: { profile: LeagueProfile }) {
  const t = useT();
  const qc = useQueryClient();
  const [name, setName] = useState(profile.displayName ?? "");
  const [optOut, setOptOut] = useState(profile.leaguesOptOut);
  // The API refuses the same names (packages/core name-filter); saying so here explains why.
  const refused = name.trim() !== "" && !nameAllowed(name.trim());
  const save = useMutation({
    mutationFn: () => putLeagueProfile({ displayName: name.trim() || null, leaguesOptOut: optOut }),
    onSuccess: () =>
      Promise.all(
        ["me", "league", "league-history"].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      ),
  });
  return (
    <Card index={2}>
      <View className="gap-3">
        <Text className="font-display text-lg text-indigo">{t("leagueSettings.title")}</Text>
        <Text className="font-body-semibold text-sm text-ink">
          {t("leagueSettings.displayName")}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={40}
          accessibilityLabel={t("leagueSettings.displayName")}
          testID="league-display-name"
          className="min-h-12 rounded-2xl border-2 border-cloud-deep bg-cloud px-4 py-3 font-body text-base text-ink"
        />
        <Text className="font-body text-sm text-mist">{t("leagueSettings.nameHint")}</Text>
        {refused && (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="font-body-semibold text-sm text-coral-deep"
            testID="league-name-refused"
          >
            {t("leagueSettings.nameNotAllowed")}
          </Text>
        )}
        <View className="flex-row items-center gap-3">
          <Text className="flex-1 font-body-semibold text-base text-ink">
            {t("leagueSettings.optOut")}
          </Text>
          <Switch
            label={t("leagueSettings.optOut")}
            value={optOut}
            onValueChange={setOptOut}
            testID="leagues-opt-out"
          />
        </View>
        <Text className="font-body text-sm text-mist">{t("leagueSettings.optOutHint")}</Text>
        {save.isError && (
          <Text accessibilityRole="alert" className="font-body text-coral-deep">
            {t("common.error")}
          </Text>
        )}
        {save.isSuccess && (
          <Text accessibilityLiveRegion="polite" className="font-body text-sea-deep">
            {t("settings.saved")}
          </Text>
        )}
        <Button
          label={t("leagueSettings.save")}
          disabled={save.isPending || refused}
          variant="sea"
          onPress={() => save.mutate()}
          testID="save-league-settings"
        />
      </View>
    </Card>
  );
}

import { confirmWordMatches } from "@molo/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";

import { deleteAccount, exportMyData } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { useSignOut } from "~/lib/session.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { colors } from "~/ui/theme.ts";

/**
 * "Your data": download everything as JSON through the share sheet, or
 * delete the account after typing the confirmation word (DELETE, SLETT) and
 * confirming once more. Not the email: for a Hide My Email account that is a
 * relay address nobody knows by heart (Apple 5.1.1(v)). Both talk to the
 * API the learner is signed in to; nothing is cached on the device.
 */
export function AccountData() {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const signOut = useSignOut();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const exportData = useMutation({
    mutationFn: async () => {
      const data = await exportMyData();
      const file = new File(
        Paths.cache,
        `molo-export-${new Date().toISOString().slice(0, 10)}.json`,
      );
      file.write(JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/json",
          UTI: "public.json",
          dialogTitle: t("account.export"),
        });
      }
      return file.uri;
    },
    onError: (e) => setError(e instanceof Error ? e.message : t("common.error")),
  });

  const remove = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: async () => {
      qc.clear();
      await signOut();
      Alert.alert(t("account.deleted"));
      router.navigate("/");
    },
    onError: (e) => setError(e instanceof Error ? e.message : t("common.error")),
  });

  const word = t("account.confirmWord");
  const matches = confirmWordMatches(confirm, word);

  return (
    <Card index={5}>
      <Text className="mb-1 font-display text-lg text-indigo">{t("account.title")}</Text>
      <Text className="mb-3 font-body text-sm text-mist">{t("account.body")}</Text>
      <View className="mb-6 items-start">
        <Button
          label={exportData.isPending ? t("common.loading") : t("account.export")}
          variant="indigo"
          disabled={exportData.isPending}
          onPress={() => exportData.mutate()}
          testID="export-data"
        />
      </View>
      <Text className="mb-1 font-display text-base text-coral-deep">
        {t("account.deleteTitle")}
      </Text>
      <Text className="mb-2 font-body text-sm text-mist">{t("account.deleteBody", { word })}</Text>
      <Text className="mb-2 font-body text-sm text-mist">{t("account.deleteStoreNote")}</Text>
      <TextInput
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        placeholder={word}
        placeholderTextColor={colors.mistSoft}
        accessibilityLabel={t("account.confirmLabel", { word })}
        className="mb-3 min-h-12 rounded-2xl border-2 border-cloud-deep bg-cloud px-4 py-2 font-body text-base text-ink"
        testID="delete-confirm-word"
      />
      {error && <Text className="mb-2 font-body-semibold text-sm text-coral-deep">{error}</Text>}
      <View className="items-start">
        <Button
          label={remove.isPending ? t("common.loading") : t("account.delete")}
          variant="coral"
          disabled={!matches || remove.isPending}
          onPress={() =>
            Alert.alert(t("account.deleteTitle"), t("account.deleteConfirm"), [
              { text: t("common.cancel"), style: "cancel" },
              { text: t("account.delete"), style: "destructive", onPress: () => remove.mutate() },
            ])
          }
          testID="delete-account"
        />
      </View>
    </Card>
  );
}

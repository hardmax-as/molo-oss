import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { getMistakes } from "~/lib/api.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";

/**
 * The way into "practise mistakes", with the number of words waiting. A
 * guest has no server state, so the card is not shown at all; the account
 * wall lives on the screen itself.
 */
export function MistakesCard({ index = 0 }: { index?: number }) {
  const t = useT();
  const { lang } = useLang();
  const me = useMe();
  const router = useRouter();
  const mistakes = useQuery({
    queryKey: ["mistakes", lang],
    queryFn: () => getMistakes(lang),
    enabled: !!me.data,
    staleTime: 30_000,
  });
  const count = mistakes.data?.count ?? 0;
  if (!me.data || count === 0) return null;
  return (
    <Card tone="sand" index={index}>
      <View className="flex-row items-center gap-3" testID="mistakes-card">
        <View className="flex-1">
          <Text className="font-display text-lg text-indigo">{t("mistakes.title")}</Text>
          <Text className="mt-1 font-body text-sm text-mist">{t("mistakes.open", { count })}</Text>
        </View>
        <Button
          label={t("mistakes.start")}
          variant="coral"
          onPress={() => router.push("/review/mistakes")}
          testID="start-mistakes"
        />
      </View>
    </Card>
  );
}

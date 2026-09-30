import { Redirect, Stack } from "expo-router";
import { Text } from "react-native";

import { canReview } from "~/lib/editor-access.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";
import { Screen } from "~/ui/Screen.tsx";
import { stackOptions } from "~/ui/stack-options.ts";

export default function EditorStack() {
  const me = useMe();
  const t = useT();
  if (me.isPending)
    return (
      <Screen>
        <Text>{t("common.loading")}</Text>
      </Screen>
    );
  if (!canReview(me.data)) return <Redirect href="/" />;
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ title: t("edit.reviewQueue") }} />
      <Stack.Screen name="studio" options={{ title: t("edit.phoneStudio.title") }} />
      <Stack.Screen name="[id]" options={{ title: t("edit.mobile.detail") }} />
    </Stack>
  );
}

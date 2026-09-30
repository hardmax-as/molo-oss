import { Stack } from "expo-router";

import { useT } from "~/lib/i18n.tsx";
import { stackOptions } from "~/ui/stack-options.ts";

export default function LeaguesStack() {
  const t = useT();
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ title: t("leagues.title") }} />
    </Stack>
  );
}

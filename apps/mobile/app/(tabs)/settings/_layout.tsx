import { Stack } from "expo-router";

import { useT } from "~/lib/i18n.tsx";
import { stackOptions } from "~/ui/stack-options.ts";

export default function SettingsStack() {
  const t = useT();
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ title: t("settings.title") }} />
      <Stack.Screen name="licences" options={{ title: t("legal.licences") }} />
    </Stack>
  );
}

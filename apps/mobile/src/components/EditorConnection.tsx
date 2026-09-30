import { useNetworkState } from "expo-network";
import { Text } from "react-native";

import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Screen } from "~/ui/Screen.tsx";

export function useEditorConnection() {
  const network = useNetworkState();
  return network.isConnected !== false && network.isInternetReachable !== false;
}

/** Uses the app's usual error screen and retry control; editorial data is never cached offline. */
export function EditorConnection({ retry }: { retry: () => void }) {
  const t = useT();
  return (
    <Screen>
      <Text accessibilityRole="alert" className="font-body text-ink">
        {t("edit.mobile.needsConnection")}
      </Text>
      <Button label={t("common.retry")} onPress={retry} />
    </Screen>
  );
}

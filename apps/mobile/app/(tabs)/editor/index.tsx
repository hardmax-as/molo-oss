import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";

import { EditorConnection, useEditorConnection } from "~/components/EditorConnection.tsx";
import { canReview } from "~/lib/editor-access.ts";
import { EDITOR_REVIEW_KEY, getEditorQueue } from "~/lib/editor-review.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";
import { Button } from "~/ui/Button.tsx";
import { Screen } from "~/ui/Screen.tsx";

export default function EditorQueue() {
  const t = useT();
  const me = useMe();
  const router = useRouter();
  const online = useEditorConnection();
  const queue = useQuery({
    queryKey: [EDITOR_REVIEW_KEY, me.data?.user.id, "queue"],
    queryFn: getEditorQueue,
    enabled: canReview(me.data) && online,
    gcTime: 0,
    retry: false,
    refetchInterval: online ? 30_000 : false,
  });
  if (!canReview(me.data)) return null;
  if (!online || queue.isError) return <EditorConnection retry={() => void queue.refetch()} />;
  return (
    <Screen>
      <Button
        label={t("edit.phoneStudio.title")}
        variant="cloud"
        onPress={() => router.push("/editor/studio")}
      />
      {queue.isPending && <Text className="font-body text-mist">{t("common.loading")}</Text>}
      {queue.data?.length === 0 && (
        <Text className="font-body text-mist">{t("edit.mobile.empty")}</Text>
      )}
      {queue.data?.map((item) => (
        <Pressable
          key={`${item.entityKind}:${item.entityId}`}
          accessibilityRole="button"
          className="rounded-2xl bg-cloud p-4"
          disabled={!item.lexemeId}
          onPress={() =>
            router.push({
              pathname: "/editor/[id]",
              params: { id: item.entityId, kind: item.entityKind, lexemeId: item.lexemeId! },
            })
          }
        >
          <Text className="font-body-semibold text-lg text-indigo">{item.label}</Text>
          <Text className="font-body text-sm text-mist">
            {t(item.entityKind === "lexeme" ? "edit.mobile.lexeme" : "edit.mobile.gloss")}
          </Text>
        </Pressable>
      ))}
      <Button
        variant="ghost"
        label={t("edit.mobile.refresh")}
        onPress={() => void queue.refetch()}
        disabled={queue.isFetching}
      />
    </Screen>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { AudioButton } from "~/components/AudioButton.tsx";
import { EditorConnection, useEditorConnection } from "~/components/EditorConnection.tsx";
import { canReview } from "~/lib/editor-access.ts";
import { EDITOR_REVIEW_KEY, getReviewLexeme, reviewItem } from "~/lib/editor-review.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";
import { Button } from "~/ui/Button.tsx";
import { Screen } from "~/ui/Screen.tsx";

export default function ReviewDetail() {
  const { id, kind, lexemeId } = useLocalSearchParams<{
    id: string;
    kind: string;
    lexemeId: string;
  }>();
  const t = useT();
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const online = useEditorConnection();
  const [note, setNote] = useState("");
  const valid =
    typeof id === "string" &&
    typeof lexemeId === "string" &&
    (kind === "lexeme" || kind === "gloss");
  const detail = useQuery({
    queryKey: [EDITOR_REVIEW_KEY, me.data?.user.id, "lexeme", lexemeId],
    queryFn: () => getReviewLexeme(lexemeId),
    enabled: canReview(me.data) && online && valid,
    gcTime: 0,
    retry: false,
  });
  const move = useMutation({
    mutationFn: (action: "approve" | "send-back") =>
      reviewItem(kind as "lexeme" | "gloss", id, action, note),
    retry: false,
    networkMode: "always",
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [EDITOR_REVIEW_KEY] });
      router.back();
    },
  });
  if (!canReview(me.data)) return null;
  if (!online || detail.isError) return <EditorConnection retry={() => void detail.refetch()} />;
  if (!valid)
    return (
      <Screen>
        <Text>{t("common.error")}</Text>
      </Screen>
    );
  if (!detail.data)
    return (
      <Screen>
        <Text>{t("common.loading")}</Text>
      </Screen>
    );
  const { lexeme, glosses, audio, revisions } = detail.data;
  const item =
    kind === "lexeme" ? (lexeme.id === id ? lexeme : undefined) : glosses.find((g) => g.id === id);
  const history =
    kind === "lexeme" ? revisions : (glosses.find((g) => g.id === id)?.revisions ?? []);
  const reviewedGloss = kind === "gloss" ? glosses.find((g) => g.id === id) : undefined;
  const own = kind === "lexeme" && lexeme.createdBy === me.data?.user.id;
  return (
    <Screen>
      <View>
        <Text className="font-body-semibold text-mist">
          {reviewedGloss
            ? t("edit.mobile.reviewingGloss", {
                language: t(reviewedGloss.sourceLang === "nb" ? "common.nb" : "common.en"),
              })
            : t("edit.mobile.lexeme")}
        </Text>
        <Text className="font-display text-3xl text-indigo">{lexeme.lemma}</Text>
        <Text className="font-body text-mist">
          {t("edit.lexeme.nounClass")}: {lexeme.nounClass ?? t("edit.mobile.notRecorded")}
        </Text>
      </View>
      {(["en", "nb"] as const).map((lang) => {
        const gloss = glosses.find((g) => g.sourceLang === lang);
        return (
          <View key={lang} className="rounded-2xl bg-cloud p-4">
            <Text className="font-body-semibold text-indigo">
              {t(lang === "en" ? "common.en" : "common.nb")}
            </Text>
            <Text className="font-body text-ink">
              {gloss?.gloss ?? t("edit.mobile.notRecorded")}
            </Text>
            {gloss && (
              <Text className="font-body text-sm text-mist">
                {t(`edit.mobile.origin.${gloss.origin ?? "unknown"}`)}
              </Text>
            )}
          </View>
        );
      })}
      <View className="gap-3">
        <Text className="font-body-semibold text-indigo">{t("edit.lexeme.audio")}</Text>
        {audio.map((clip) => (
          <AudioButton key={clip.id} url={clip.url} label={t("edit.mobile.playAudio")} />
        ))}
        {!audio.length && (
          <Text className="font-body text-mist">{t("edit.mobile.notRecorded")}</Text>
        )}
      </View>
      <View className="gap-2">
        <Text className="font-body-semibold text-indigo">{t("edit.lexeme.revisions")}</Text>
        {history
          .filter((r) => r.note)
          .map((r) => (
            <Text key={r.id} className="font-body text-ink">
              {r.note}
            </Text>
          ))}
        {!history.some((r) => r.note) && (
          <Text className="font-body text-mist">{t("edit.mobile.noNote")}</Text>
        )}
      </View>
      {move.isError && (
        <View className="gap-3">
          <Text accessibilityRole="alert" className="font-body text-coral-deep">
            {t("edit.mobile.rejected")}
          </Text>
          <Button
            label={t("common.retry")}
            onPress={() => {
              move.reset();
              void detail.refetch();
            }}
          />
        </View>
      )}
      {item?.status === "in_review" ? (
        <View className="gap-4">
          {own && <Text className="font-body text-mist">{t("edit.gate.four_eyes")}</Text>}
          <Button
            label={t("edit.lexeme.approve")}
            disabled={move.isPending || own}
            onPress={() => move.mutate("approve")}
          />
          <Text className="font-body-semibold text-indigo">{t("edit.mobile.note")}</Text>
          <TextInput
            accessibilityLabel={t("edit.mobile.note")}
            value={note}
            onChangeText={setNote}
            editable={!move.isPending}
            multiline
            maxLength={2000}
            className="min-h-24 rounded-2xl bg-cloud p-4 font-body text-ink"
          />
          <Button
            label={t("edit.lexeme.reject")}
            variant="cloud"
            disabled={move.isPending || !note.trim()}
            onPress={() => move.mutate("send-back")}
          />
        </View>
      ) : (
        <Text className="font-body text-mist">{t("edit.mobile.noLongerInReview")}</Text>
      )}
    </Screen>
  );
}

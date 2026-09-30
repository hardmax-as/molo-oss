import { EXERCISE_REPORT_REASONS, type ExerciseReportReason } from "@molo/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useAnnounce } from "~/lib/announce.ts";
import { ApiError, reportExercise } from "~/lib/api.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";
import { Button } from "~/ui/Button.tsx";
import { colors } from "~/ui/theme.ts";

/**
 * "Report this exercise" — the learner's half of the review loop. A wrong
 * gloss should reach an editor from inside the lesson, not from a one-star
 * review on the store two weeks later.
 *
 * The exercise's id travels in context rather than through all ten widgets:
 * only the runner knows it, and only the check bar needs it. A report is a
 * note; it never changes a status.
 */
const ExerciseIdContext = createContext<string | null>(null);

export function CurrentExercise({ id, children }: { id: string; children: ReactNode }) {
  return <ExerciseIdContext.Provider value={id}>{children}</ExerciseIdContext.Provider>;
}

export function useCurrentExerciseId(): string | null {
  return useContext(ExerciseIdContext);
}

/**
 * The action under the check bar's verdict.
 *
 * A guest sees the same action, but it opens the account wall instead of the
 * form. The report itself still needs a name on it — an anonymous firehose
 * would cost the editors more than it earns them — but hiding the action
 * costs us the report entirely, and a wrong gloss in the free lesson is the
 * one we most need to hear about.
 */
export function ReportAction({ onDark }: { onDark: boolean }) {
  const t = useT();
  const me = useMe();
  const exerciseId = useCurrentExerciseId();
  const [open, setOpen] = useState(false);
  // Until the session resolves we do not know which of the two sheets to open.
  if (!exerciseId || me.isPending) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("lesson.report.action")}
        hitSlop={8}
        onPress={() => setOpen(true)}
        testID="report-exercise"
        className="mt-3 self-start"
      >
        <Text
          className={`font-body-semibold text-xs underline ${onDark ? "text-cloud/90" : "text-mist"}`}
        >
          {t("lesson.report.action")}
        </Text>
      </Pressable>
      {me.data ? (
        <ReportSheet exerciseId={exerciseId} visible={open} onClose={() => setOpen(false)} />
      ) : (
        <ReportSignUpSheet visible={open} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/**
 * What a guest gets instead of the form: why a name is needed, and the two
 * ways to get one. Exported so the developer gallery can open it directly.
 */
export function ReportSignUpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const go = (path: "/auth", params?: { mode: string }) => {
    onClose();
    router.push(params ? { pathname: path, params } : path);
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-indigo/40">
        <View className="rounded-t-4xl bg-sand px-5 pb-10 pt-6" testID="report-signup">
          <Text className="mb-2 font-display text-xl text-indigo">
            {t("lesson.report.guestTitle")}
          </Text>
          <Text className="mb-5 font-body text-sm text-mist">{t("lesson.report.guestBody")}</Text>
          <View className="gap-3">
            <Button
              label={t("guest.create")}
              variant="sun"
              size="lg"
              full
              onPress={() => go("/auth", { mode: "signup" })}
              testID="report-signup-create"
            />
            <Button
              label={t("guest.haveAccount")}
              variant="cloud"
              full
              onPress={() => go("/auth")}
            />
            <Button label={t("lesson.report.cancel")} variant="ghost" full onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Exported so the developer gallery can open the flow without a lesson behind it. */
export function ReportSheet({
  exerciseId,
  visible,
  onClose,
}: {
  exerciseId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState<ExerciseReportReason>("wrong_gloss");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<"sent" | "already" | null>(null);
  const send = useMutation({
    mutationFn: () => reportExercise(exerciseId, { reason, ...(note.trim() ? { note } : {}) }),
    onSuccess: (r) => setDone(r.alreadyReported ? "already" : "sent"),
  });
  // The two live regions below are Android's. iOS gets the same two lines
  // here, whichever of them is showing.
  useAnnounce(
    done
      ? done === "already"
        ? t("lesson.report.already")
        : t("lesson.report.thanks")
      : send.isError
        ? send.error instanceof ApiError && send.error.code === "report_rate_limited"
          ? t("lesson.report.tooMany")
          : t("lesson.report.failed")
        : null,
  );
  const close = () => {
    setDone(null);
    setNote("");
    send.reset();
    onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View className="flex-1 justify-end bg-indigo/40">
        <View className="max-h-[85%] rounded-t-4xl bg-sand px-5 pb-10 pt-6">
          <Text className="mb-4 font-display text-xl text-indigo">{t("lesson.report.title")}</Text>
          {done ? (
            <Text accessibilityLiveRegion="polite" className="font-body text-base text-sea-deep">
              {done === "already" ? t("lesson.report.already") : t("lesson.report.thanks")}
            </Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {EXERCISE_REPORT_REASONS.map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: reason === r }}
                  onPress={() => setReason(r)}
                  className={`mb-2 min-h-12 justify-center rounded-2xl border-2 px-4 py-3 ${
                    reason === r ? "border-sun bg-sun/15" : "border-cloud-deep bg-cloud"
                  }`}
                >
                  <Text className="font-body text-base text-ink">
                    {t(`lesson.report.reason.${r}`)}
                  </Text>
                </Pressable>
              ))}
              <Text className="mb-1 mt-3 font-body-semibold text-sm text-mist">
                {t("lesson.report.note")}
              </Text>
              <TextInput
                value={note}
                onChangeText={(v) => setNote(v.slice(0, 500))}
                multiline
                numberOfLines={3}
                placeholderTextColor={colors.mist}
                accessibilityLabel={t("lesson.report.note")}
                className="mb-4 min-h-20 rounded-2xl border-2 border-cloud-deep bg-cloud px-4 py-3 font-body text-base text-ink"
              />
              {send.isError && (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                  className="mb-3 font-body text-sm text-coral-deep"
                >
                  {/* A refusal says why. The rate limit is the only one a
                      learner can act on, so it gets its own sentence. */}
                  {send.error instanceof ApiError && send.error.code === "report_rate_limited"
                    ? t("lesson.report.tooMany")
                    : t("lesson.report.failed")}
                </Text>
              )}
              <View className="flex-row justify-end gap-3">
                <Button label={t("lesson.report.cancel")} variant="cloud" onPress={close} />
                <Button
                  label={t("lesson.report.send")}
                  variant="indigo"
                  disabled={send.isPending}
                  onPress={() => send.mutate()}
                  testID="report-send"
                />
              </View>
            </ScrollView>
          )}
          {done ? (
            <View className="mt-6">
              <Button label={t("common.close")} variant="indigo" full onPress={close} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

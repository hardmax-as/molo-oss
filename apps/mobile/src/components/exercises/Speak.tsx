import { type ExercisePayload } from "@molo/core";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { AudioButton } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { haptic } from "~/ui/haptics.ts";
import { useMotion } from "~/ui/motion.ts";
import { useSfx } from "~/ui/sfx.tsx";
import { colors } from "~/ui/theme.ts";

import { CheckBar } from "./CheckBar.tsx";
import { SpeechBubble } from "./SpeechBubble.tsx";
import { lexemeOf, SKIPPED, type ExerciseProps } from "./types.ts";
import { WordHint, glossForHint } from "./WordHint.tsx";

/** Nothing to hide: the prompt is the thing to say, not the thing to guess. */
const NO_HIDDEN_WORDS: ReadonlySet<string> = new Set();

type P = Extract<ExercisePayload, { type: "speak" }>;

/**
 * Hear the speaker, record yourself, play both side by side, then answer
 * honestly. XP only on "sounded right"; there is no scoring of the take
 * (no ASR), so the exercise is a mirror, not a judge. Microphone denial
 * skips the exercise without XP and without shaming.
 */
export function Speak({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sfx = useSfx();
  const m = useMotion();
  const reference = content.audioAssets[payload.referenceAudioAssetId];
  const promptText =
    "lexemeId" in payload.prompt
      ? lexemeOf(content, payload.prompt.lexemeId)?.lemma
      : content.sentences[payload.prompt.sentenceId]?.textXh;
  const promptGloss =
    "lexemeId" in payload.prompt
      ? lexemeOf(content, payload.prompt.lexemeId)?.gloss?.gloss
      : content.sentences[payload.prompt.sentenceId]?.gloss?.gloss;
  // Sentence prompts get the mascot and the word hints; a single word keeps
  // the big, plain card it already had.
  const promptTokens =
    "sentenceId" in payload.prompt
      ? (content.sentences[payload.prompt.sentenceId]?.tokens ?? null)
      : null;

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 200);
  const [takeUri, setTakeUri] = useState<string | null>(null);
  const take = useAudioPlayer(takeUri);
  const takeStatus = useAudioPlayerStatus(take);
  const [denied, setDenied] = useState(false);
  const [verdict, setVerdict] = useState<boolean | null>(null);

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (rec.isRecording && !m.reduced) {
      pulse.value = withRepeat(
        withSequence(withTiming(1.15, { duration: 400 }), withTiming(1, { duration: 400 })),
        -1,
        false,
      );
    } else pulse.value = withTiming(1, { duration: 150 });
  }, [rec.isRecording, m.reduced, pulse]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  useEffect(() => {
    sfx.setClipPlaying(takeStatus.playing);
  }, [takeStatus.playing, sfx]);

  async function start() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setDenied(true);
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    void haptic.light();
  }

  async function stop() {
    if (!rec.isRecording) return;
    await recorder.stop();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    setTakeUri(recorder.uri ?? null);
    void haptic.medium();
  }

  if (denied) {
    return (
      <View>
        <Text className="mb-3 font-display text-xl text-indigo">{t("lesson.speak.title")}</Text>
        <View className="rounded-3xl bg-cloud p-4">
          <Text className="font-body text-base text-ink">{t("lesson.speak.micDenied")}</Text>
        </View>
        <View className="mt-4">
          <Button label={t("lesson.skip")} variant="cloud" onPress={() => onDone(SKIPPED)} />
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text className="mb-3 font-display text-xl text-indigo">{t("lesson.speak.title")}</Text>
      {/* A sentence is said by somebody: the penguin is the learner, waiting
          to hear it back. Every word can be tapped for its meaning — the
          prompt is the thing to say, not the thing to guess. */}
      {promptTokens ? (
        <SpeechBubble speaker="producing">
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-2">
            {promptTokens.map((k) => (
              <WordHint
                key={k.position}
                word={k.surfaceForm}
                gloss={glossForHint(content, k.lexemeId, NO_HIDDEN_WORDS)}
              />
            ))}
          </View>
          {promptGloss ? (
            <Text className="mt-2 font-body text-base text-mist">{promptGloss}</Text>
          ) : null}
        </SpeechBubble>
      ) : null}
      {/* The reference recording. With the bubble above it this card is the
          speaker's row on its own, so it loses the prompt and the gap. */}
      <View className={`mb-4 rounded-3xl bg-cloud ${promptTokens ? "p-4" : "p-5"}`}>
        {promptTokens ? null : (
          <>
            <Text className="font-display text-3xl text-ink" accessibilityLanguage="xh">
              {promptText ?? "?"}
            </Text>
            {promptGloss ? (
              <Text className="mt-1 font-body text-base text-mist">{promptGloss}</Text>
            ) : null}
          </>
        )}
        <View className={`flex-row items-center gap-3 ${promptTokens ? "" : "mt-4"}`}>
          <AudioButton
            url={reference?.url}
            label={t("lesson.speak.theirs")}
            attribution={reference?.attribution}
            autoPlay
          />
          <Text className="font-body-semibold text-ink">{t("lesson.speak.theirs")}</Text>
          {!reference && (
            <Text className="font-body text-xs text-mist">{t("lesson.speak.noReference")}</Text>
          )}
        </View>
      </View>

      <View className="items-center py-4">
        <Animated.View style={ringStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("lesson.speak.record")}
            testID="record"
            onPressIn={() => void start()}
            onPressOut={() => void stop()}
            disabled={verdict !== null}
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: rec.isRecording ? colors.coral : colors.sun,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 6,
              borderColor: rec.isRecording ? colors.coralDeep : colors.sunDeep,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: rec.isRecording ? 6 : 14,
                backgroundColor: colors.cloud,
              }}
            />
          </Pressable>
        </Animated.View>
        <Text className="mt-3 font-body-semibold text-base text-ink">
          {rec.isRecording ? t("lesson.speak.recording") : t("lesson.speak.record")}
        </Text>
      </View>

      {takeUri && (
        <View className="mb-2 flex-row items-center gap-3 rounded-3xl bg-cloud p-4">
          <AudioButton url={takeUri} label={t("lesson.speak.yours")} />
          <Text className="font-body-semibold text-ink">{t("lesson.speak.yours")}</Text>
          <View className="flex-1" />
          <AudioButton url={reference?.url} label={t("lesson.speak.theirs")} small />
        </View>
      )}

      {takeUri && verdict === null && (
        <View className="mt-4 rounded-3xl bg-sand-deep p-4">
          <Text className="mb-3 font-display text-lg text-ink">{t("lesson.speak.compare")}</Text>
          <View className="flex-row gap-3">
            <Button
              label={t("lesson.speak.soundedRight")}
              variant="sea"
              onPress={() => setVerdict(true)}
              testID="sounded-right"
            />
            <Button
              label={t("lesson.speak.notYet")}
              variant="cloud"
              onPress={() => setVerdict(false)}
              testID="not-yet"
            />
          </View>
        </View>
      )}
      {verdict !== null && (
        <CheckBar
          canCheck={false}
          checked={verdict}
          onCheck={() => undefined}
          onContinue={() =>
            onDone({ correct: verdict, xp: verdict ? currentTuning().xp.correct : 0 })
          }
        />
      )}
      {!takeUri && verdict === null && (
        <View className="mt-4 items-end">
          <Button label={t("lesson.skip")} variant="ghost" onPress={() => onDone(SKIPPED)} />
        </View>
      )}
    </View>
  );
}

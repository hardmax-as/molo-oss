import { type ExercisePayload } from "@molo/core";
import { useState } from "react";
import { Pressable, Text, View, type AccessibilityActionEvent } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

import { AudioButton, useAudioControls } from "~/components/AudioButton.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { haptic } from "~/ui/haptics.ts";
import { useSfx } from "~/ui/sfx.tsx";
import { runTileAction, tileAccessibilityActions } from "~/ui/tile-a11y.ts";

import { CheckBar } from "./CheckBar.tsx";
import { lexemeOf, seedOf, shuffle, type ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "class_sort" }>;

export function ClassSort({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sfx = useSfx();
  const items = shuffle(payload.items, seedOf(payload.items.map((i) => i.lexemeId).join()));
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean | null>(null);
  const { controls, controlFor } = useAudioControls();
  const remaining = items.filter((i) => !(i.lexemeId in placed));
  const allPlaced = remaining.length === 0;

  function place(bucket: string) {
    if (!active) return;
    sfx.play("tap");
    void haptic.tap();
    setPlaced((p) => ({ ...p, [active]: bucket }));
    setActive(null);
  }
  const correct = () =>
    items.every((i) => placed[i.lexemeId] === lexemeOf(content, i.lexemeId)?.nounClass);

  return (
    <View>
      <Text className="mb-4 font-display text-xl text-indigo">{t("lesson.sortClasses")}</Text>
      {remaining.length > 0 && (
        <View className="mb-4 flex-row flex-wrap gap-2">
          {remaining.map((i) => {
            const lx = lexemeOf(content, i.lexemeId);
            const isActive = active === i.lexemeId;
            return (
              <Animated.View key={i.lexemeId} layout={LinearTransition.duration(180)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={lx?.lemma ?? ""}
                  accessibilityState={{ selected: isActive }}
                  // The nested play button is hidden inside this chip for VoiceOver;
                  // the clip is its "play" action instead (audit M05).
                  {...(lx?.audio?.url
                    ? {
                        accessibilityActions: tileAccessibilityActions({
                          label: t("lesson.listen"),
                          play: () => controls.current.get(i.lexemeId)?.play(),
                        }),
                        onAccessibilityAction: (e: AccessibilityActionEvent) =>
                          runTileAction(e.nativeEvent.actionName, {
                            press: () => setActive(i.lexemeId),
                            playAction: {
                              label: t("lesson.listen"),
                              play: () => controls.current.get(i.lexemeId)?.play(),
                            },
                          }),
                      }
                    : {})}
                  onPress={() => {
                    void haptic.tap();
                    setActive(i.lexemeId);
                  }}
                  className={`min-h-11 flex-row items-center gap-2 rounded-full border-2 bg-cloud py-1 ${lx?.audio?.url ? "pl-1" : "pl-4"} pr-4 ${isActive ? "border-indigo" : "border-cloud-deep"}`}
                  style={{ borderBottomWidth: 4 }}
                >
                  {lx?.audio?.url && (
                    <AudioButton
                      controlRef={controlFor(i.lexemeId)}
                      url={lx.audio.url}
                      label={lx.lemma}
                      small
                      variant="tile"
                    />
                  )}
                  <Text className="font-display text-lg text-ink" accessibilityLanguage="xh">
                    {lx?.lemma}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      )}
      <View className="gap-3">
        {payload.buckets.map((b) => (
          <Pressable
            key={b}
            accessibilityRole="button"
            accessibilityLabel={t("nounClass.label", { label: b })}
            onPress={() => place(b)}
            disabled={!active || checked !== null}
            className={`min-h-20 rounded-3xl border-2 border-dashed bg-cloud p-3 ${active ? "border-indigo" : "border-cloud-deep"}`}
          >
            <Text className="mb-2 font-body-bold text-sm text-mist">
              {t("nounClass.label", { label: b })}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {items
                .filter((i) => placed[i.lexemeId] === b)
                .map((i) => {
                  const lx = lexemeOf(content, i.lexemeId);
                  const right = lx?.nounClass === b;
                  const chip =
                    checked === null ? "bg-sand-deep" : right ? "bg-sea-deep" : "bg-coral-deep";
                  const text = checked === null ? "text-ink" : "text-cloud";
                  return (
                    <Pressable
                      key={i.lexemeId}
                      accessibilityRole="button"
                      accessibilityLabel={lx?.lemma ?? ""}
                      disabled={checked !== null}
                      onPress={() =>
                        setPlaced((p) => {
                          const { [i.lexemeId]: _gone, ...rest } = p;
                          return rest;
                        })
                      }
                      className={`min-h-11 justify-center rounded-full px-4 ${chip}`}
                    >
                      <Text className={`font-display text-base ${text}`} accessibilityLanguage="xh">
                        {lx?.lemma}
                      </Text>
                    </Pressable>
                  );
                })}
            </View>
          </Pressable>
        ))}
      </View>
      <CheckBar
        canCheck={allPlaced}
        checked={checked}
        onCheck={() => setChecked(correct())}
        onContinue={() =>
          onDone({ correct: checked === true, xp: checked ? currentTuning().xp.correct : 0 })
        }
      />
    </View>
  );
}

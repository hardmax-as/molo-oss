import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { formatCountdown, type HeartsState } from "~/lib/hearts-format.ts";
import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Penguin } from "~/ui/Mascots.tsx";
import { useMotion } from "~/ui/motion.ts";

/** A lesson cannot start or continue: practise for a heart, wait, or get Plus. */
export function OutOfHearts({
  state,
  onLater,
}: {
  state: HeartsState;
  onLater?: (() => void) | undefined;
}) {
  const t = useT();
  const router = useRouter();
  const m = useMotion();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const wait = formatCountdown(state.nextRegenAt, now);
  const body = (
    <>
      <Penguin pose="sleep" size={120} />
      <View
        className="mb-3 mt-1 flex-row gap-1"
        accessibilityLabel={t("hearts.count", { hearts: state.hearts, max: state.max })}
      >
        {Array.from({ length: state.max }, (_, i) => (
          <Text
            key={i}
            className={`text-2xl ${i < state.hearts ? "text-coral-deep" : "text-cloud-deep"}`}
          >
            ♥
          </Text>
        ))}
      </View>
      <Text className="font-display text-2xl text-indigo">{t("hearts.outTitle")}</Text>
      <Text className="mt-1 text-center font-body text-base text-mist">
        {wait ? t("hearts.nextIn", { time: wait }) : t("hearts.outBody")}
      </Text>
      <View className="mt-5 w-full gap-3">
        <Button
          label={t("hearts.practise", { count: state.practiceLeft })}
          variant="sea"
          size="lg"
          full
          onPress={() => router.push("/review")}
          testID="hearts-practise"
        />
        <Button
          label={t("hearts.getPlus")}
          variant="sun"
          size="lg"
          full
          onPress={() => router.push("/plus")}
          testID="hearts-plus"
        />
        {onLater && (
          <Button
            label={t("hearts.later")}
            variant="cloud"
            full
            onPress={onLater}
            testID="hearts-later"
          />
        )}
      </View>
    </>
  );

  // Always a card in the page, never a native sheet. Navigating from inside a
  // presented SwiftUI/Material sheet (Practise, Get Plus, Continue later) was
  // swallowed on iOS, and swiping the sheet away could leave the paused lesson
  // with nothing on screen and no way out (e2e of #180-#182, 2026-09-28).
  return (
    <Animated.View
      entering={FadeIn.duration(m.enter)}
      className="items-center rounded-4xl bg-cloud p-6"
      testID="out-of-hearts"
    >
      {body}
    </Animated.View>
  );
}

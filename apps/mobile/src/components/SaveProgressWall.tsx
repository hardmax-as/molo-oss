import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Penguin } from "~/ui/Mascots.tsx";
import { useMotion } from "~/ui/motion.ts";
import { nativeUiAvailable } from "~/ui/native-ui.ts";
import { Sheet } from "~/ui/Sheet.tsx";
import { XpChip } from "~/ui/XpChip.tsx";

/**
 * The account wall: a guest has finished the free lesson and has something
 * to lose. Sign-up or sign-in keeps the XP; nothing is taken away.
 */
export function SaveProgressWall({
  xp,
  lessons,
  onLater,
}: {
  xp: number;
  lessons: number;
  onLater?: (() => void) | undefined;
}) {
  const t = useT();
  const router = useRouter();
  const m = useMotion();
  const body = (
    <>
      <Penguin pose="cheer" size={130} />
      <View className="my-3">
        <XpChip xp={xp} size="xl" signed={false} />
      </View>
      <Text className="text-center font-display-bold text-2xl text-indigo">
        {t("guest.wallTitle")}
      </Text>
      <Text className="mt-1 text-center font-body text-base text-mist">
        {t("guest.wallBody", { count: lessons })}
      </Text>
      <View className="mt-5 w-full gap-3">
        <Button
          label={t("guest.create")}
          variant="sun"
          size="lg"
          full
          onPress={() => router.push({ pathname: "/auth", params: { mode: "signup" } })}
          testID="wall-create"
        />
        <Button
          label={t("guest.haveAccount")}
          variant="cloud"
          full
          onPress={() => router.push("/auth")}
          testID="wall-sign-in"
        />
        {onLater && (
          <Button
            label={t("hearts.later")}
            variant="ghost"
            full
            onPress={onLater}
            testID="wall-later"
          />
        )}
      </View>
      <Text className="mt-4 text-center font-body text-xs text-mist">{t("guest.keep")}</Text>
    </>
  );

  // Same rule as OutOfHearts: an interruption the learner can leave becomes a
  // real sheet, one they cannot leave stays a page.
  if (onLater && nativeUiAvailable()) {
    return (
      <Sheet visible onDismiss={onLater} testID="save-progress-wall">
        <View className="items-center">{body}</View>
      </Sheet>
    );
  }
  return (
    <Animated.View
      entering={FadeIn.duration(m.enter)}
      className="items-center rounded-4xl bg-cloud p-6"
      testID="save-progress-wall"
    >
      {body}
    </Animated.View>
  );
}

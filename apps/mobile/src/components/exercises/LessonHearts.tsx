import { heartsLostBetween, type LessonHeartsView } from "@molo/core/lesson";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useAnnounce } from "~/lib/announce.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMotion } from "~/ui/motion.ts";
import { colors } from "~/ui/theme.ts";

/**
 * The hearts on the right of the lesson strip, where Duolingo keeps them. A
 * guest has none to lose and sees nothing; Plus sees ∞; everyone else sees
 * the count, which the runner lowers the moment a wrong answer is continued
 * past rather than a network round trip later (`lessonHeartsView`).
 *
 * A lost heart is meant to be seen: the heart pops and shakes, a copy of it
 * drops away, the number ticks down and a brief "−1" rises. Closed-form
 * springs (`duration` + `dampingRatio`), damped enough not to wobble. Under
 * reduced motion the number simply changes.
 *
 * Not a button: a tap in the middle of an exercise must not leave it. The
 * loss is said out loud the way the web's live region says it — an explicit
 * announcement on iOS, the live region on Android (`~/lib/announce.ts`).
 */
export function LessonHearts({ view }: { view: LessonHeartsView }) {
  const t = useT();
  const m = useMotion();
  const [losses, setLosses] = useState(0);
  const [lostMessage, setLostMessage] = useState<string | null>(null);
  const before = useRef(view);
  const pop = useSharedValue(1);
  const tilt = useSharedValue(0);
  const tick = useSharedValue(0);
  const hearts = view.kind === "count" ? view.hearts : null;
  const max = view.kind === "count" ? view.max : null;
  // A layout effect, so the frame that first shows the lower number is
  // already the first frame of its animation rather than a still frame
  // followed by a jump.
  useLayoutEffect(() => {
    const lost = heartsLostBetween(before.current, view);
    before.current = view;
    if (lost <= 0 || hearts === null || max === null) return;
    setLosses((n) => n + 1);
    setLostMessage(t("hearts.lost", { hearts, max }));
    if (m.reduced) return;
    pop.value = withSequence(
      withTiming(1.3, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(1, { duration: 320, dampingRatio: 0.7 }),
    );
    tilt.value = withSequence(
      withTiming(-14, { duration: 70 }),
      withTiming(11, { duration: 90 }),
      withTiming(-6, { duration: 90 }),
      withTiming(0, { duration: 110 }),
    );
    tick.value = -8;
    tick.value = withDelay(120, withSpring(0, { duration: 260, dampingRatio: 1 }));
    // `view` is rebuilt on every render; its kind and count are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.kind, hearts]);
  useAnnounce(lostMessage);
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { rotate: `${tilt.value}deg` }],
  }));
  const countStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tick.value }],
    opacity: 1 + tick.value / 10,
  }));

  if (view.kind === "none") return null;
  if (view.kind === "unlimited")
    return (
      <View
        accessible
        accessibilityLabel={t("hearts.unlimited")}
        className="flex-row items-center gap-1 rounded-full bg-indigo px-2.5 py-1"
        testID="lesson-hearts"
      >
        <Text className="text-base text-sun">♥</Text>
        <Text className="font-display-bold text-base text-sun">∞</Text>
      </View>
    );
  const empty = view.hearts <= 0;
  return (
    <View
      accessible
      accessibilityLabel={lostMessage ?? t("hearts.count", { hearts: view.hearts, max: view.max })}
      // Android reads a changed label out; iOS has the announcement above.
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-1 rounded-full bg-coral/15 px-2.5 py-1"
      testID="lesson-hearts"
    >
      <View>
        <Animated.View style={heartStyle}>
          <Text className={`text-base ${empty ? "text-mist-soft" : "text-coral-deep"}`}>♥</Text>
        </Animated.View>
        {/* The heart that went: it falls away, tilting, and fades. */}
        {losses > 0 && !m.reduced && <FallingHeart key={`drop-${losses}`} />}
      </View>
      <Animated.View style={countStyle}>
        <Text className="font-display-bold text-base text-coral-deep">{view.hearts}</Text>
      </Animated.View>
      {losses > 0 && !m.reduced && <MinusOne key={`minus-${losses}`} />}
    </View>
  );
}

/** A copy of the heart, dropping out of the strip. Mounted once per loss. */
function FallingHeart() {
  const y = useSharedValue(0);
  const turn = useSharedValue(0);
  const fade = useSharedValue(1);
  useEffect(() => {
    y.value = withTiming(28, { duration: 650, easing: Easing.in(Easing.cubic) });
    turn.value = withTiming(32, { duration: 650, easing: Easing.in(Easing.quad) });
    fade.value = withDelay(150, withTiming(0, { duration: 500 }));
  }, [y, turn, fade]);
  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [
      { translateY: y.value },
      { rotate: `${turn.value}deg` },
      { scale: 1 - y.value / 140 },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: 0, top: 0 }, style]}
      testID="lesson-hearts-drop"
    >
      <Text style={{ color: colors.coral }} className="text-base">
        ♥
      </Text>
    </Animated.View>
  );
}

/** "−1", rising and fading above the count. A numeral, not copy. */
function MinusOne() {
  const y = useSharedValue(0);
  const fade = useSharedValue(0);
  useEffect(() => {
    y.value = withTiming(-20, { duration: 900, easing: Easing.out(Easing.cubic) });
    fade.value = withSequence(
      withTiming(1, { duration: 150 }),
      withDelay(450, withTiming(0, { duration: 300 })),
    );
  }, [y, fade]);
  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: y.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", right: 4, top: -6 }, style]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text className="font-display-bold text-sm text-coral-deep">−1</Text>
    </Animated.View>
  );
}

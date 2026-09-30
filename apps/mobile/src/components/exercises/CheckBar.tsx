import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import { PatternCorrection } from "~/components/grammar/PatternCorrection.tsx";
import { useAnnounce } from "~/lib/announce.ts";
import { useT } from "~/lib/i18n.tsx";
import { useLessonScroll } from "~/lib/lesson-scroll.tsx";
import { Button } from "~/ui/Button.tsx";
import { haptic } from "~/ui/haptics.ts";
import { useMotion } from "~/ui/motion.ts";
import { useSfx } from "~/ui/sfx.tsx";
import { XhosaText } from "~/ui/XhosaText.tsx";

import { ReportAction } from "./ReportAction.tsx";

/**
 * Check / Continue bar. On a verdict it plays the sound, fires the haptic
 * and says what was right (docs/DESIGN.md: feedback teaches, never only
 * scolds). `detail` is an optional extra line (typo hint, click hint).
 */
export function CheckBar({
  canCheck,
  checked,
  correctAnswer,
  detail,
  onCheck,
  onContinue,
  checkLabel,
}: {
  canCheck: boolean;
  checked: boolean | null;
  correctAnswer?: string | undefined;
  detail?: string | undefined;
  onCheck: () => void;
  onContinue: () => void;
  checkLabel?: string;
}) {
  const t = useT();
  const sfx = useSfx();
  const m = useMotion();
  const scrollToEnd = useLessonScroll();
  // The verdict, as one utterance, for the platform whose live region does
  // nothing. `accessibilityLiveRegion` below covers the other one.
  useAnnounce(
    checked === null
      ? null
      : [
          checked ? t("lesson.correct") : t("lesson.incorrect"),
          checked === false && correctAnswer
            ? `${t("lesson.correctAnswerWas")}: ${correctAnswer}`
            : "",
          detail ?? "",
        ]
          .filter(Boolean)
          .join(". "),
  );
  useEffect(() => {
    if (checked === true) {
      sfx.play("correct");
      void haptic.success();
    } else if (checked === false) {
      sfx.play("wrong");
      void haptic.warning();
    }
    if (checked !== null) {
      // Let the verdict lay out, then bring Continue into view.
      const id = setTimeout(scrollToEnd, 60);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [checked, sfx, scrollToEnd]);
  // As on the web: white on the deep sea face when right, coral-deep on the
  // soft coral tint when wrong, so the verdict text and the painted clicks
  // in the answer all reach 4.5:1 (packages/brand/src/palette.test.ts).
  const bg = checked === null ? "bg-sand-deep" : checked ? "bg-sea-deep" : "bg-coral-soft";
  const fg = checked === null ? "text-ink" : checked ? "text-cloud" : "text-coral-deep";
  return (
    <Animated.View
      key={String(checked)}
      entering={FadeInUp.duration(m.enter)}
      className={`mt-6 rounded-3xl p-4 ${bg}`}
      accessibilityLiveRegion="polite"
    >
      {checked !== null && (
        <View className="mb-3">
          <Text className={`font-display text-xl ${fg}`}>
            {checked ? t("lesson.correct") : t("lesson.incorrect")}
          </Text>
          {checked === false && correctAnswer ? (
            <Text className={`mt-1 font-body-semibold text-base ${fg}`}>
              {t("lesson.correctAnswerWas")}:{" "}
              {/* Painted and tagged, as the web bar does it: the answer is
                  isiXhosa inside an otherwise translated sentence. */}
              <XhosaText text={correctAnswer} className="font-display text-lg" />
            </Text>
          ) : null}
          {detail ? <Text className={`mt-1 font-body text-sm ${fg}`}>{detail}</Text> : null}
          {/* The pattern gets named here, inside the bar's own polite live
              region, so the verdict and the correction are announced as one
              utterance. No pressable is added, so the scroll-to-Continue
              behaviour above is untouched. */}
          {checked === false ? <PatternCorrection /> : null}
          {/* Where a wrong gloss reaches an editor, instead of a one-star
              review on the store. */}
          <ReportAction onDark={checked === true} />
        </View>
      )}
      {checked === null ? (
        <Button
          label={checkLabel ?? t("lesson.check")}
          variant="indigo"
          size="lg"
          full
          disabled={!canCheck}
          onPress={onCheck}
          testID="check"
        />
      ) : (
        <Button
          label={t("lesson.continue")}
          variant={checked ? "cloud" : "cloud"}
          size="lg"
          full
          onPress={onContinue}
          testID="continue"
        />
      )}
    </Animated.View>
  );
}

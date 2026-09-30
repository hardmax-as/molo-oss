import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useT } from "~/lib/i18n.tsx";
import { useMotion } from "~/ui/motion.ts";
import { XhosaText } from "~/ui/XhosaText.tsx";

import type { Content } from "./types.ts";

/**
 * One word of a sentence prompt, with its meaning a tap away — a dictionary
 * hint, not a translation of the whole line. The gloss is the sentence's
 * linked lexeme in the learner's own language, so it is a published
 * editor's words and never something composed here.
 *
 * `gloss: null` means the exercise is testing this word: it renders as
 * plain text with no affordance, so a hint can never hand over the answer.
 * The tappable ones carry a faint dotted underline so they can be found.
 */
export function WordHint({
  word,
  gloss,
  size = "text-2xl",
  defaultOpen = false,
}: {
  word: string;
  gloss: string | null;
  size?: string;
  /** Dev-only: the developer gallery shows the popover without a tap. */
  defaultOpen?: boolean;
}) {
  const t = useT();
  const m = useMotion();
  const [open, setOpen] = useState(defaultOpen);
  const painted = <XhosaText text={word} className={`font-display ${size} text-ink`} />;
  if (gloss === null) return painted;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("lesson.wordHint.open", { word })}
        accessibilityState={{ expanded: open }}
        hitSlop={6}
        onPress={() => setOpen((o) => !o)}
        testID="word-hint"
        className="border-b-2 border-dotted border-mist-soft pb-0.5"
      >
        {painted}
      </Pressable>
      {open && (
        <Animated.View
          entering={FadeIn.duration(m.enter)}
          className="absolute left-0 top-full z-20 mt-1 max-w-56 rounded-2xl bg-indigo px-3 py-2"
          testID="word-hint-popover"
        >
          <Text className="font-body-semibold text-sm text-cloud">
            {gloss === "" ? t("lesson.wordHint.none") : gloss}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

/**
 * The gloss to hand `WordHint` for one token: the published gloss, `""`
 * when the word has none yet, and `null` when this exercise is testing it
 * and a hint would be the answer.
 */
export function glossForHint(
  content: Content,
  lexemeId: string | undefined,
  hidden: ReadonlySet<string>,
): string | null {
  if (!lexemeId || hidden.has(lexemeId)) return null;
  return content.lexemes[lexemeId]?.gloss?.gloss ?? "";
}

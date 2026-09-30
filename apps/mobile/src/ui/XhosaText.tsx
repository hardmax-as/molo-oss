import { Text, type TextProps } from "react-native";

import { clickRuns } from "~/components/exercises/helpers.ts";
import { clickColors } from "~/ui/theme.ts";

/**
 * isiXhosa on screen: the click consonants in their fixed colours
 * (docs/DESIGN.md "Learning first": c sea, x sun, q coral) so a learner sees
 * the click before hearing it, and the language tagged so a screen reader
 * knows what it is reading.
 *
 * `accessibilityLanguage` is the mobile counterpart of the web's `lang="xh"`
 * (WCAG 3.1.2). React Native marks it `@platform ios`, so it changes nothing
 * on Android; that is not a reason to leave it off the half of the audience
 * where it works. No common screen reader ships an isiXhosa voice, so the
 * ceiling is low either way — a tagged word is at least not asserted to be
 * English, and tone is carried by the audio rather than the synthesiser.
 *
 * This replaces three copies of the same painting code that had grown up in
 * `TranslateType`, `WordHint` and `RecallCard`.
 */
export function XhosaText({
  text,
  className = "",
  ...rest
}: { text: string; className?: string } & Omit<TextProps, "children">) {
  return (
    <Text className={className} accessibilityLanguage="xh" {...rest}>
      {clickRuns(text).map((r, i) => (
        <Text key={i} style={r.click ? { color: clickColors[r.click] } : undefined}>
          {r.text}
        </Text>
      ))}
    </Text>
  );
}

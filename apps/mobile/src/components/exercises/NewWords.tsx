import { Text, View } from "react-native";

import { AudioButton } from "~/components/AudioButton.tsx";
import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { XhosaText } from "~/ui/XhosaText.tsx";

import type { Content } from "./types.ts";

/**
 * Meeting a word before being asked for it (`newWordIntroductions` in
 * @molo/core decides where this goes). The word, its recording played once
 * on arrival, and its meaning in the learner's own language — all of it the
 * published lexeme already in the unit payload, nothing composed. A word
 * with no gloss in this language still gets its lemma and its recording.
 *
 * Unscored: no hearts, no XP, no mistakes, and the progress bar does not
 * move. Several new words for one exercise share one card, a row each with
 * its own play button; only the first plays by itself, so three recordings
 * never talk over each other. With listening off nothing plays and no play
 * button is offered, as in every other exercise in quiet mode.
 */
export function NewWords({
  words,
  content,
  listening,
  onContinue,
}: {
  words: readonly string[];
  content: Content;
  listening: boolean;
  onContinue: () => void;
}) {
  const t = useT();
  const lexemes = words.flatMap((id) => {
    const lx = content.lexemes[id];
    return lx ? [lx] : [];
  });
  const one = lexemes.length === 1 ? lexemes[0] : null;
  return (
    <View testID="new-word-card">
      <Text accessibilityRole="header" className="mb-3 font-display text-xl text-indigo">
        {one ? t("lesson.intro.one") : t("lesson.intro.many")}
      </Text>
      {one ? (
        <View className="mb-6 rounded-3xl bg-cloud p-5">
          <View className="flex-row items-center gap-4">
            {listening && (
              <AudioButton
                url={one.audio?.url}
                label={t("lesson.listen")}
                attribution={one.audio?.attribution}
                autoPlay
              />
            )}
            <XhosaText text={one.lemma} className="flex-1 font-display-bold text-4xl text-ink" />
          </View>
          {one.gloss ? (
            <Text className="mt-3 font-body-semibold text-xl text-indigo">{one.gloss.gloss}</Text>
          ) : null}
        </View>
      ) : (
        <View className="mb-6 gap-3">
          {lexemes.map((lx, i) => (
            <View key={lx.id} className="flex-row items-center gap-3 rounded-3xl bg-cloud p-3">
              {listening && (
                <AudioButton
                  url={lx.audio?.url}
                  label={t("lesson.intro.listen", { word: lx.lemma })}
                  attribution={lx.audio?.attribution}
                  autoPlay={i === 0}
                  small
                />
              )}
              <View className="flex-1">
                <XhosaText text={lx.lemma} className="font-display-bold text-2xl text-ink" />
                {lx.gloss ? (
                  <Text className="font-body text-base text-mist">{lx.gloss.gloss}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
      <Button
        label={t("lesson.continue")}
        variant="indigo"
        size="lg"
        full
        onPress={onContinue}
        testID="new-word-continue"
      />
    </View>
  );
}

import type { LexemeView } from "@molo/core";
import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { AudioButton } from "~/components/AudioButton.tsx";
import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { useMotion } from "~/ui/motion.ts";
import { XhosaText } from "~/ui/XhosaText.tsx";

function Lemma({ text }: { text: string }) {
  return (
    <XhosaText
      text={text}
      className="font-display-bold text-5xl text-ink"
      accessibilityLabel={text}
    />
  );
}

export interface RecallAction {
  key: string | number;
  label: string;
  variant: "coral" | "sun" | "sea" | "indigo";
  testID?: string;
}

/**
 * One recall card: hear the word, remember the meaning, reveal, answer. The
 * review session and the mistakes session are the same interaction with
 * different buttons behind it, so they share this rather than drifting.
 */
export function RecallCard({
  id,
  lexeme,
  actions,
  revealed,
  onReveal,
  onAnswer,
  disabled = false,
}: {
  id: string;
  lexeme: LexemeView | undefined;
  actions: readonly RecallAction[];
  revealed: boolean;
  onReveal: () => void;
  onAnswer: (key: RecallAction["key"]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const m = useMotion();
  return (
    <>
      <Animated.View key={id} entering={FadeIn.duration(m.enter)}>
        <Card>
          <View className="flex-row items-center gap-4">
            <AudioButton
              key={id}
              url={lexeme?.audio?.url}
              label={t("lesson.listen")}
              attribution={lexeme?.audio?.attribution}
              autoPlay
            />
            <View className="flex-1">
              <Lemma text={lexeme?.lemma ?? "?"} />
            </View>
          </View>
          {revealed ? (
            <View className="mt-5">
              <Text className="font-display text-2xl text-ink">{lexeme?.gloss?.gloss ?? "?"}</Text>
              {lexeme?.gloss?.usageNote ? (
                <Text className="mt-1 font-body text-sm text-ink">{lexeme.gloss.usageNote}</Text>
              ) : null}
              {lexeme?.gloss?.contrastiveNote ? (
                <Text className="mt-1 font-body text-sm text-mist">
                  {lexeme.gloss.contrastiveNote}
                </Text>
              ) : null}
            </View>
          ) : (
            <View className="mt-5">
              <Button
                label={t("review.reveal")}
                variant="indigo"
                full
                size="lg"
                onPress={onReveal}
                testID="reveal"
              />
            </View>
          )}
        </Card>
      </Animated.View>
      {revealed && (
        <View className="flex-row gap-2">
          {actions.map((a) => (
            <View key={a.key} className="flex-1">
              <Button
                label={a.label}
                variant={a.variant}
                full
                size="sm"
                disabled={disabled}
                onPress={() => onAnswer(a.key)}
                {...(a.testID ? { testID: a.testID } : {})}
              />
            </View>
          ))}
        </View>
      )}
    </>
  );
}

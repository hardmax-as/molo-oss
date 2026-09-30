import type { ReactNode } from "react";
import { View } from "react-native";

import { useT } from "~/lib/i18n.tsx";
import { Crane, Penguin, Sunbird } from "~/ui/Mascots.tsx";

/**
 * A sentence is never a line of text in a void: somebody says it. Which
 * mascot depends on what is being asked of the learner (docs/DESIGN.md
 * "Illustration"), and the same three cases as apps/web:
 *
 * - `listening` — the sunbird, the voice: the prompt is something to hear.
 * - `teaching` — the crane, the mentor: the sentence is shown and explained.
 * - `producing` — the penguin, the learner: it waits to hear it back.
 *
 * Only sentence prompts get one; a single word keeps its larger layout.
 */
export type PromptSpeaker = "listening" | "teaching" | "producing";

export function SpeechBubble({
  speaker,
  children,
}: {
  speaker: PromptSpeaker;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <View className="mb-5 flex-row items-end gap-1">
      <View
        accessibilityRole="image"
        accessibilityLabel={t(`lesson.speaker.${speaker}`)}
        className="shrink-0"
      >
        {speaker === "listening" && <Sunbird pose="listen" size={72} />}
        {speaker === "teaching" && <Crane pose="hello" size={72} />}
        {speaker === "producing" && <Penguin pose="listen" size={72} />}
      </View>
      <View className="flex-1 rounded-3xl rounded-bl-md border-2 border-cloud-deep bg-cloud px-4 py-3">
        {children}
      </View>
    </View>
  );
}

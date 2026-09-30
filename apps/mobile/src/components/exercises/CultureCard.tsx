import type { ExercisePayload } from "@molo/core";
import { Text, View } from "react-native";

import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Crane } from "~/ui/Mascots.tsx";

import type { ExerciseProps } from "./types.ts";

type P = Extract<ExercisePayload, { type: "culture_card" }>;

/** Something explained, so the crane (the mentor) introduces it. */
export function CultureCard({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const lang = content.sourceLang;
  return (
    <Card tone="sun" className="p-6">
      <View className="mb-3 flex-row items-center gap-3">
        <Text className="flex-1 font-display text-2xl text-ink">
          {payload.title[lang] ?? payload.title["en"]}
        </Text>
        <Crane pose="hello" size={80} />
      </View>
      <Text className="mb-6 font-body text-lg leading-7 text-ink">
        {payload.body[lang] ?? payload.body["en"]}
      </Text>
      <View className="items-start">
        <Button
          label={t("lesson.continue")}
          variant="indigo"
          onPress={() => onDone({ correct: true, xp: 0 })}
        />
      </View>
    </Card>
  );
}

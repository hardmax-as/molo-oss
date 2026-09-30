import type { GrammarReferenceEntry } from "@molo/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { GrammarNote } from "~/components/grammar/GrammarNote.tsx";
import { getGrammar } from "~/lib/api.ts";
import { readSeenNotes } from "~/lib/grammar-seen.ts";
import { useContentTitle, useLang, useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Screen } from "~/ui/Screen.tsx";

/**
 * The reference screen (docs/GRAMMAR.md section 1: "a reference page stays
 * available for anyone who wants to go back to it"). Every rule this learner
 * has unlocked, rendered with the same `GrammarNote` the lesson uses — a
 * screen that kept its own copy would drift and then lie.
 *
 * "Unlocked" is the server's answer for a signed-in learner (a finished
 * lesson in the note's skill); a guest has no rows there, so whatever this
 * device has actually shown stands in for it. What is still ahead is counted
 * rather than listed.
 */
export default function GrammarScreen() {
  const t = useT();
  const { lang } = useLang();
  const title = useContentTitle();
  const query = useQuery({ queryKey: ["grammar", lang], queryFn: () => getGrammar(lang) });
  const [seen, setSeen] = useState<readonly string[]>([]);
  const [showLocked, setShowLocked] = useState(false);
  useEffect(() => {
    let live = true;
    void readSeenNotes().then((ids) => {
      if (live) setSeen(ids);
      return ids;
    });
    return () => {
      live = false;
    };
  }, []);

  if (query.isPending)
    return (
      <Screen>
        <Text className="font-body text-mist">{t("common.loading")}</Text>
      </Screen>
    );
  if (query.isError || !query.data)
    return (
      <Screen>
        <Text className="font-body-semibold text-coral-deep">{t("common.error")}</Text>
      </Screen>
    );

  const isOpen = (n: GrammarReferenceEntry) => n.unlocked || seen.includes(n.id);
  const notes = query.data.notes;
  const open = notes.filter(isOpen);
  const locked = notes.filter((n) => !isOpen(n));

  return (
    <Screen gap="gap-6" testID="grammar-screen">
      {/* The crane belongs to the note itself, where the explaining happens. */}
      <Text className="font-body text-base leading-6 text-mist">{t("grammar.subtitle")}</Text>

      {open.length === 0 && locked.length === 0 && (
        <Card tone="sand">
          <Text className="font-body text-base text-ink">{t("grammar.reference.empty")}</Text>
        </Card>
      )}

      {open.map((note) => (
        <View key={note.id}>
          <Text className="mb-2 font-body-semibold text-xs text-mist uppercase">
            {t("grammar.reference.inSkill", {
              unit: title(note.unitTitleKey, note.unitSlug),
              skill: title(note.skillTitleKey, note.slug),
            })}
          </Text>
          <GrammarNote note={note} audio={query.data.audioAssets} />
        </View>
      ))}

      {locked.length > 0 && (
        <View className="gap-3">
          <Text className="font-body-semibold text-sm text-mist">
            {t("grammar.reference.lockedCount", { count: locked.length })}
          </Text>
          <View className="items-start">
            <Button
              label={
                showLocked ? t("grammar.reference.hideLocked") : t("grammar.reference.showLocked")
              }
              variant="cloud"
              size="sm"
              onPress={() => setShowLocked((v) => !v)}
            />
          </View>
          {showLocked &&
            locked.map((note) => (
              <Card key={note.id} tone="sand">
                <Text className="font-display text-lg text-indigo">{note.title}</Text>
                <Text className="mt-1 font-body text-sm text-mist">
                  {t("grammar.reference.lockedHint")}
                </Text>
              </Card>
            ))}
        </View>
      )}
    </Screen>
  );
}

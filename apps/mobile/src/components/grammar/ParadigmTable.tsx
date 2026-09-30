import {
  isKnownColumnKey,
  paradigmOf,
  type GrammarCellView,
  type GrammarNoteView,
} from "@molo/core";
import { ScrollView, Text, View } from "react-native";

import { AudioButton } from "~/components/AudioButton.tsx";
import { useT } from "~/lib/i18n.tsx";

import { MorphemeSplit } from "./MorphemeSplit.tsx";
import { paradigmRowLabel } from "./paradigm-label.ts";
import type { GrammarAudio } from "./types.ts";

/**
 * The paradigm. React Native has no table element, so the structure is
 * carried by the accessibility tree instead: the whole thing is one labelled
 * region, each row is one accessible element whose label reads "class, then
 * column: form", and the visual grid is hidden from VoiceOver so it is not
 * read as a heap of loose words.
 *
 * **Every cell carries its own play button** (docs/GRAMMAR.md: the audio is
 * part of the rule, because tone is phonemic and the spelling does not mark
 * it). A cell with no recording says so; a cell the note has nothing for is
 * simply blank.
 *
 * The grid scrolls horizontally on its own, so a narrow phone never has to
 * shrink the isiXhosa to fit.
 */
export function ParadigmTable({ note, audio }: { note: GrammarNoteView; audio: GrammarAudio }) {
  const t = useT();
  const paradigm = paradigmOf(note.cells);
  if (paradigm.rows.length === 0) return null;
  const label = (key: string) =>
    isKnownColumnKey(key) ? t(`grammar.columns.${key}` as never) : key;

  return (
    <View accessibilityLabel={t("grammar.tableCaption", { title: note.title })}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View
            className="flex-row border-b border-sand-deep pb-2"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text className="w-16 font-body-semibold text-xs text-mist uppercase">
              {label(note.rowHeaderKey)}
            </Text>
            {paradigm.columns.map((col) => (
              <Text key={col} className="w-40 font-body-semibold text-xs text-mist uppercase">
                {label(col)}
              </Text>
            ))}
          </View>
          {paradigm.rows.map((row) => (
            <View
              key={row.label}
              className="flex-row items-center border-b border-sand-deep py-3"
              accessible
              accessibilityLabel={paradigmRowLabel({
                rowHeader: label(note.rowHeaderKey),
                rowLabel: row.label,
                columns: paradigm.columns.map(label),
                cells: row.cells,
              })}
            >
              <Text className="w-16 font-display text-base text-indigo">{row.label}</Text>
              {row.cells.map((cell, i) => (
                <View key={paradigm.columns[i] ?? i} className="w-40 pr-2">
                  {cell ? <ParadigmCell cell={cell} audio={audio} /> : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ParadigmCell({ cell, audio }: { cell: GrammarCellView; audio: GrammarAudio }) {
  const t = useT();
  const ref = cell.audioAssetId ? (audio[cell.audioAssetId] ?? null) : null;
  return (
    <View className="flex-row items-center gap-2">
      <MorphemeSplit surfaceForm={cell.surfaceForm} morphemes={cell.morphemes} size="sm" />
      <AudioButton
        url={ref?.url ?? null}
        label={t("lesson.listen")}
        attribution={ref?.attribution ?? null}
        small
      />
    </View>
  );
}

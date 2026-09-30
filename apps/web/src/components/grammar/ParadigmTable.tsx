import {
  isKnownColumnKey,
  paradigmOf,
  type GrammarCellView,
  type GrammarNoteView,
} from "@molo/core";

import { AudioButton } from "~/components/AudioButton.tsx";
import { useT } from "~/lib/i18n.tsx";

import { MorphemeSplit } from "./MorphemeSplit.tsx";
import type { GrammarAudio } from "./types.ts";

/**
 * The paradigm as a real table (docs/ACCESSIBILITY.md: proper headers, a
 * caption). Rows are `th scope="row"`, columns are `th scope="col"`, and the
 * whole thing scrolls inside its own container so a narrow screen never
 * scrolls the page sideways.
 *
 * **Every cell carries its own play button**, because GRAMMAR.md says the
 * audio is part of the rule and not an illustration of it: tone is phonemic
 * and the spelling does not mark it, so a written paradigm on its own is
 * incomplete. A cell with no recording says "no recording yet" in a fully
 * opaque control rather than showing a ghost of one, and a cell the note has
 * nothing for is simply empty.
 */
export function ParadigmTable({ note, audio }: { note: GrammarNoteView; audio: GrammarAudio }) {
  const t = useT();
  const paradigm = paradigmOf(note.cells);
  if (paradigm.rows.length === 0) return null;
  const label = (key: string) =>
    isKnownColumnKey(key) ? t(`grammar.columns.${key}` as never) : key;

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[18rem] border-collapse text-left">
        <caption className="sr-only">{t("grammar.tableCaption", { title: note.title })}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="border-b border-mist-soft py-2 pr-3 text-xs font-semibold tracking-wide text-mist uppercase"
            >
              {label(note.rowHeaderKey)}
            </th>
            {paradigm.columns.map((col) => (
              <th
                key={col}
                scope="col"
                className="border-b border-mist-soft py-2 pr-3 text-xs font-semibold tracking-wide text-mist uppercase"
              >
                {label(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paradigm.rows.map((row) => (
            <tr key={row.label} className="align-top">
              <th
                scope="row"
                className="border-b border-mist-soft py-3 pr-3 font-display text-base font-bold whitespace-nowrap text-indigo"
              >
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                <td key={paradigm.columns[i] ?? i} className="border-b border-mist-soft py-3 pr-3">
                  {cell ? <ParadigmCell cell={cell} audio={audio} /> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParadigmCell({ cell, audio }: { cell: GrammarCellView; audio: GrammarAudio }) {
  const t = useT();
  const ref = cell.audioAssetId ? (audio[cell.audioAssetId] ?? null) : null;
  return (
    <span className="flex items-center gap-2">
      <MorphemeSplit surfaceForm={cell.surfaceForm} morphemes={cell.morphemes} size="sm" />
      <AudioButton
        url={ref?.url ?? null}
        label={t("lesson.listen")}
        attribution={ref?.attribution ?? null}
        size="sm"
      />
    </span>
  );
}

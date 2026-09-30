/**
 * Reading `curriculum/spine.json` and `curriculum/themes.json` off disk.
 *
 * Kept apart from `spine.ts` so the schema stays free of I/O: only the CLI
 * and the tests read files. The path is resolved from this module rather
 * than from the process's working directory, so `molo content curate` works
 * from anywhere in the repo.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCultureCards, type CultureCardsFile } from "../culture-cards.ts";
import { parseGrammarNotes, type GrammarNotesFile } from "../grammar.ts";
import { parseSentenceRequests, type SentenceRequestsFile } from "../sentence-requests.ts";
import { parseSpine, parseThemes, type Spine, type ThemeMap } from "./spine.ts";

/** `<repo>/curriculum`. */
export const CURRICULUM_DIR = fileURLToPath(new URL("../../../../curriculum/", import.meta.url));

export interface CurriculumFiles {
  readonly spine: Spine;
  readonly themes: ThemeMap;
  readonly dir: string;
}

/** `curriculum/grammar-notes.json`, the notes `molo content grammar` loads. */
export function loadGrammarNotes(dir: string = CURRICULUM_DIR): GrammarNotesFile {
  return parseGrammarNotes(readFileSync(join(dir, "grammar-notes.json"), "utf8"));
}

/** `curriculum/sentence-requests.json`, the requests `molo content sentence-requests` loads. */
export function loadSentenceRequests(dir: string = CURRICULUM_DIR): SentenceRequestsFile {
  return parseSentenceRequests(readFileSync(join(dir, "sentence-requests.json"), "utf8"));
}

/** `curriculum/culture-cards.json`, the cards `molo content culture` loads. */
export function loadCultureCards(dir: string = CURRICULUM_DIR): CultureCardsFile {
  return parseCultureCards(readFileSync(join(dir, "culture-cards.json"), "utf8"));
}

export function loadCurriculum(dir: string = CURRICULUM_DIR): CurriculumFiles {
  const spine = parseSpine(JSON.parse(readFileSync(join(dir, "spine.json"), "utf8")));
  const themes = parseThemes(JSON.parse(readFileSync(join(dir, "themes.json"), "utf8")));
  return { spine, themes, dir };
}

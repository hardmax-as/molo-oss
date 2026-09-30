/**
 * __DEV__-ONLY FIXTURE. Never shipped: every use is guarded by `__DEV__`,
 * which Metro strips from production bundles, and the slug is not a real
 * unit. It exists so the lesson runner can be exercised before an editor
 * has published anything.
 *
 * The lemmas and English glosses are the isixhosa.click entries that
 * spike/unit1.exercises.json references (CC-BY-SA-4.0); nothing here is
 * invented isiXhosa. Norwegian glosses are the spike's `(ai_draft)` ones and
 * are labelled as such. There is no audio, so the widgets show their
 * "no audio" state, which is the honest state for unrecorded content.
 */

import {
  decodeExercisePayload,
  taughtLexemeIds,
  type GrammarNoteView,
  type UnitResponse,
} from "@molo/core";
import { Either } from "effect";

export const DEMO_UNIT_SLUG = "dev-fixture-unit-1";

const ids = {
  unit: "00000000-0000-4000-8000-00000000f001",
  skill: "00000000-0000-4000-8000-00000000f002",
  lesson: "00000000-0000-4000-8000-00000000f003",
  /** A second, short lesson so the guest account wall (lesson two) can be exercised. */
  lesson2: "00000000-0000-4000-8000-00000000f004",
  molo: "00000000-0000-4000-8000-00000000f101",
  molweni: "00000000-0000-4000-8000-00000000f102",
  enkosi: "00000000-0000-4000-8000-00000000f103",
  uxolo: "00000000-0000-4000-8000-00000000f104",
  umntu: "00000000-0000-4000-8000-00000000f105",
  abantu: "00000000-0000-4000-8000-00000000f106",
  umthi: "00000000-0000-4000-8000-00000000f107",
  igama: "00000000-0000-4000-8000-00000000f108",
  isikolo: "00000000-0000-4000-8000-00000000f109",
  inja: "00000000-0000-4000-8000-00000000f110",
  sentence: "00000000-0000-4000-8000-00000000f201",
} as const;

/**
 * The fixture's ids, so a __DEV__ surface (the developer gallery) can point
 * at one of these lexemes without guessing a uuid or re-declaring a word.
 */
export const DEMO_IDS = ids;

type Lexeme = UnitResponse["lexemes"][string];

function lex(
  id: string,
  lemma: string,
  pos: string,
  nounClass: string | null,
  en: string,
  nb: string,
  lang: "en" | "nb",
): Lexeme {
  return {
    id,
    lemma,
    pos,
    nounClass,
    isPlural: false,
    infinitive: null,
    register: "standard",
    gloss: {
      gloss: lang === "nb" ? `${nb} (ai_draft)` : en,
      usageNote: null,
      contrastiveNote: null,
    },
    audio: null,
    voices: [],
  };
}

type Lesson = UnitResponse["unit"]["skills"][number]["lessons"][number];
type RawExercise = Omit<Lesson["exercises"][number], "teaches" | "moment">;

/**
 * Fills in the two fields the API computes per learner. `teaches` is the
 * same `taughtLexemeIds` rule the repository runs, so the fixture shows the
 * "new word" badge exactly where a real lesson would; `moment` stays null
 * because a fixture has no history of its own — the device derives it.
 */
function fx(e: RawExercise): Lesson["exercises"][number] {
  const decoded = decodeExercisePayload(e.payload);
  return {
    ...e,
    teaches: Either.isRight(decoded) ? [...taughtLexemeIds(decoded.right)] : [],
    moment: null,
  };
}

export function demoUnit(lang: "en" | "nb" = "en"): UnitResponse {
  return {
    sourceLang: lang,
    unit: {
      id: ids.unit,
      slug: DEMO_UNIT_SLUG,
      titleKey: "units.unit1.title",
      order: 999,
      cefrBand: "A1",
      prerequisiteUnitId: null,
      lessonCount: 1,
      locked: false,
      prerequisiteSlug: null,
      prerequisiteTitleKey: null,
      skills: [
        {
          id: ids.skill,
          slug: "greetings",
          titleKey: "units.unit1.skills.greetings.title",
          order: 1,
          kind: "vocab",
          grammarNotes: [],
          lessons: [
            {
              id: ids.lesson,
              order: 1,
              estimatedMinutes: 3,
              exercises: (
                [
                  {
                    id: "fx-1",
                    order: 1,
                    type: "culture_card",
                    payload: {
                      type: "culture_card",
                      title: { en: "Fixture (dev only)", nb: "Fixture (kun utvikling)" },
                      body: {
                        en: "This lesson is a development fixture with no audio. Real units appear once an editor publishes them.",
                        nb: "Denne leksjonen er en utviklingsfixture uten lyd. Ekte enheter dukker opp når en redaktør publiserer dem.",
                      },
                      lexemeIds: [ids.molo, ids.molweni],
                    },
                  },
                  {
                    id: "fx-2",
                    order: 2,
                    type: "listen_select",
                    payload: {
                      type: "listen_select",
                      prompt: { lexemeId: ids.molo },
                      options: [
                        { lexemeId: ids.molo, correct: true },
                        { lexemeId: ids.molweni, correct: false },
                        { lexemeId: ids.enkosi, correct: false },
                      ],
                    },
                  },
                  {
                    id: "fx-3",
                    order: 3,
                    type: "select_listen",
                    payload: {
                      type: "select_listen",
                      prompt: { lexemeId: ids.enkosi },
                      options: [
                        { lexemeId: ids.enkosi, correct: true },
                        { lexemeId: ids.uxolo, correct: false },
                      ],
                    },
                  },
                  {
                    id: "fx-4",
                    order: 4,
                    type: "match_pairs",
                    payload: {
                      type: "match_pairs",
                      pairs: [
                        { lexemeId: ids.molo },
                        { lexemeId: ids.molweni },
                        { lexemeId: ids.enkosi },
                        { lexemeId: ids.uxolo },
                      ],
                    },
                  },
                  {
                    id: "fx-5",
                    order: 5,
                    type: "class_sort",
                    payload: {
                      type: "class_sort",
                      buckets: ["1", "3", "5", "7", "9"],
                      items: [
                        { lexemeId: ids.umntu },
                        { lexemeId: ids.umthi },
                        { lexemeId: ids.igama },
                        { lexemeId: ids.isikolo },
                        { lexemeId: ids.inja },
                      ],
                    },
                  },
                  {
                    id: "fx-6",
                    order: 6,
                    type: "translate_tap",
                    payload: {
                      type: "translate_tap",
                      sentenceId: ids.sentence,
                      distractorLexemeIds: [ids.molweni, ids.enkosi],
                    },
                  },
                  {
                    id: "fx-7",
                    order: 7,
                    type: "click_drill",
                    payload: {
                      type: "click_drill",
                      set: "A",
                      contrast: ["c", "x", "q"],
                      steps: ["listen_identify"],
                      pairs: [],
                      contrastWords: [{ lexemeId: ids.uxolo, click: "x" }],
                    },
                  },
                ] as RawExercise[]
              ).map(fx),
            },
            {
              id: ids.lesson2,
              order: 2,
              estimatedMinutes: 2,
              exercises: (
                [
                  {
                    id: "fx-8",
                    order: 1,
                    type: "listen_select",
                    payload: {
                      type: "listen_select",
                      prompt: { lexemeId: ids.enkosi },
                      options: [
                        { lexemeId: ids.enkosi, correct: true },
                        { lexemeId: ids.molo, correct: false },
                        { lexemeId: ids.uxolo, correct: false },
                      ],
                    },
                  },
                  {
                    id: "fx-9",
                    order: 2,
                    type: "select_listen",
                    payload: {
                      type: "select_listen",
                      prompt: { lexemeId: ids.uxolo },
                      options: [
                        { lexemeId: ids.uxolo, correct: true },
                        { lexemeId: ids.molweni, correct: false },
                      ],
                    },
                  },
                ] as RawExercise[]
              ).map(fx),
            },
          ],
        },
      ],
    },
    lexemes: {
      [ids.molo]: lex(ids.molo, "molo", "interj", null, "hello", "hei", lang),
      [ids.molweni]: lex(
        ids.molweni,
        "molweni",
        "interj",
        null,
        "hello (to several)",
        "hei (til flere)",
        lang,
      ),
      [ids.enkosi]: lex(ids.enkosi, "enkosi", "interj", null, "thank you", "takk", lang),
      [ids.uxolo]: lex(ids.uxolo, "uxolo", "interj", null, "sorry", "unnskyld", lang),
      [ids.umntu]: lex(ids.umntu, "umntu", "noun", "1", "person", "menneske", lang),
      [ids.abantu]: lex(ids.abantu, "abantu", "noun", "2", "people", "mennesker", lang),
      [ids.umthi]: lex(ids.umthi, "umthi", "noun", "3", "tree", "tre", lang),
      [ids.igama]: lex(ids.igama, "igama", "noun", "5", "name", "navn", lang),
      [ids.isikolo]: lex(ids.isikolo, "isikolo", "noun", "7", "school", "skole", lang),
      [ids.inja]: lex(ids.inja, "inja", "noun", "9", "dog", "hund", lang),
    },
    sentences: {
      [ids.sentence]: {
        id: ids.sentence,
        // isixhosa.click example_id=687 under "molo" (see spike/unit1.exercises.json).
        textXh: "Molo, unjani?",
        gloss: {
          gloss: lang === "nb" ? "Hei, hvordan går det? (ai_draft)" : "Hello, how are you?",
          literalGloss: null,
        },
        tokens: [],
        audio: null,
        voices: [],
      },
    },
    audioAssets: {},
  };
}

/**
 * A grammar note for the gallery, entirely fabricated. The lemmas are the
 * fixture's own isixhosa.click entries, but the *rule* is invented developer
 * English about nothing in particular and the morpheme splits are made up:
 * a demo is never reviewed by an editor, so it must not carry a claim about
 * isiXhosa (docs/GRAMMAR.md). The last row has no recording on purpose —
 * that is the case the component has to draw honestly.
 */
export function demoGrammarNote(): GrammarNoteView {
  return {
    id: "00000000-0000-4000-8000-00000000f301",
    slug: "dev-fixture-note",
    skillId: ids.skill,
    order: 1,
    rowHeaderKey: "class",
    sourceLang: "en",
    title: "Fixture rule (developer gallery only)",
    rule: "This paragraph stands in for an editor's explanation so the layout can be looked at. It describes nothing: the splits below are invented for the demo and no editor has approved a word of it.",
    correction: "Fixture correction: this is where the pattern gets its name back.",
    cells: [
      {
        id: "demo-cell-0",
        role: "example",
        order: 0,
        rowLabel: "",
        colKey: "word",
        surfaceForm: "umntu",
        morphemes: ["um", "ntu"],
        lexemeId: ids.umntu,
        audioAssetId: null,
      },
      {
        id: "demo-cell-1",
        role: "paradigm",
        order: 1,
        rowLabel: "1",
        colKey: "singular",
        surfaceForm: "umntu",
        morphemes: ["um", "ntu"],
        lexemeId: ids.umntu,
        audioAssetId: null,
      },
      {
        id: "demo-cell-2",
        role: "paradigm",
        order: 2,
        rowLabel: "1",
        colKey: "plural",
        surfaceForm: "abantu",
        morphemes: ["aba", "ntu"],
        lexemeId: ids.abantu,
        audioAssetId: null,
      },
      {
        id: "demo-cell-3",
        role: "paradigm",
        order: 3,
        rowLabel: "5",
        colKey: "singular",
        surfaceForm: "igama",
        morphemes: [],
        lexemeId: ids.igama,
        audioAssetId: null,
      },
    ],
  };
}

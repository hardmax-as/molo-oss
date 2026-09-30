/**
 * The Unit 1 reconciliation plan, on fixtures shaped like production: the
 * spike's unit-1 with its click drills, culture card and grammar notes, and
 * a curated greet-and-introduce whose click skill picked hospital and
 * faculty words by the wrong sense. Lemmas are `zz-` placeholders; the
 * guard reads only the English glosses and the shape of the lemma.
 */

import { clickIdsForSet } from "@molo/core";
import { describe, expect, it } from "vitest";

import { parseThemes } from "./curriculum/spine.ts";
import {
  planReconcileUnit1,
  wordsAfter,
  type RcExercise,
  type ReconcileSnapshot,
  type ReconcileSpec,
} from "./reconcile-unit-1.ts";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const themes = parseThemes({
  header: ["PROPOSAL"],
  version: 1,
  themes: {
    greetings: { note: "g", senses: [], keywords: ["hello"], exclude: [] },
    clicks: {
      note: "c",
      senses: [],
      keywords: [],
      lemmaPatterns: ["[cxq]"],
      exclude: ["employers", "faculties", "wards", "sections"],
      maxLemmaWords: 1,
    },
    identity: { note: "i", senses: [], keywords: ["name"], exclude: ["homesteads"] },
  },
}).themes;

// Lexemes: good ones and the off-topic ones production picked.
const L = {
  hello: u(1),
  hi: u(2),
  spoon: u(3),
  cut: u(4),
  employers: u(5),
  legs: u(6),
  faculties: u(7),
  wards: u(8),
  sides: u(9),
  name: u(10),
  homesteads: u(11),
  home: u(12),
  drillC: u(13),
  drillX: u(14),
};
const lexemes: ReconcileSnapshot["lexemes"] = Object.fromEntries(
  (
    [
      [L.hello, "zz-hello", null, ["hello"]],
      [L.hi, "zz-hi", null, ["hello"]],
      [L.spoon, "zz-cephe", "6", ["spoons"]],
      [L.cut, "zz-cheba", null, ["cut"]],
      [L.employers, "zz-qeshi", "2", ["employers"]],
      [L.legs, "zz-cala zz-nxantathu /zz-engile", "6", ["Legs"]],
      [L.faculties, "zz-candelo", "6", ["faculties; departments"]],
      [L.wards, "zz-candelo zz-bantwana", "6", ["paediatric wards"]],
      [L.sides, "zz-cala", "6", ["sides; sections"]],
      [L.name, "zz-gama", "5", ["name"]],
      [L.homesteads, "zz-mizi", "4", ["homesteads"]],
      [L.home, "zz-khaya", "5", ["home"]],
      [L.drillC, "zz-cinga", null, ["think"]],
      [L.drillX, "zz-xoka", null, ["lie"]],
    ] as const
  ).map(([id, lemma, cls, glosses]) => [
    id,
    { id, lemma, nounClassLabel: cls, glosses: [...glosses] },
  ]),
);

let n = 100;
const ex = (type: string, payload: unknown, order: number): RcExercise => ({
  id: u(n++),
  order,
  type,
  status: "draft",
  payload,
});

const drillA = ex(
  "click_drill",
  {
    type: "click_drill",
    set: "A",
    contrast: ["c", "x", "q"],
    steps: ["listen_identify"],
    pairs: [],
    contrastWords: [
      { lexemeId: L.drillC, click: "c" },
      { lexemeId: L.drillX, click: "x" },
    ],
    note: "MISSING: minimal pair c/x; none in isixhosa.click, tutor to supply",
  },
  1,
);
const drillB = ex(
  "click_drill",
  {
    type: "click_drill",
    set: "B",
    contrast: ["c", "ch"],
    steps: ["listen_identify"],
    pairs: [],
    contrastWords: [{ lexemeId: L.cut, click: "ch" }],
  },
  1,
);
const card = ex(
  "culture_card",
  {
    type: "culture_card",
    title: { en: "t", nb: "t" },
    body: { en: "b", nb: "b" },
    lexemeIds: [L.hello],
  },
  1,
);
const leftover = ex(
  "match_pairs",
  { type: "match_pairs", pairs: [{ lexemeId: L.hello }, { lexemeId: L.hi }] },
  2,
);

const pairsMixed = ex(
  "match_pairs",
  {
    type: "match_pairs",
    pairs: [L.spoon, L.employers, L.legs, L.cut].map((lexemeId) => ({ lexemeId })),
  },
  1,
);
const pairsAllBad = ex(
  "match_pairs",
  { type: "match_pairs", pairs: [L.faculties, L.wards, L.sides].map((lexemeId) => ({ lexemeId })) },
  2,
);
const promptBad = ex(
  "listen_select",
  {
    type: "listen_select",
    prompt: { lexemeId: L.employers },
    options: [
      { lexemeId: L.employers, correct: true },
      { lexemeId: L.spoon, correct: false },
    ],
  },
  3,
);
const optionBad = ex(
  "listen_select",
  {
    type: "listen_select",
    prompt: { lexemeId: L.spoon },
    options: [
      { lexemeId: L.spoon, correct: true },
      { lexemeId: L.cut, correct: false },
      { lexemeId: L.sides, correct: false },
    ],
  },
  4,
);
const sortBad = ex(
  "class_sort",
  {
    type: "class_sort",
    buckets: ["2", "6"],
    items: [L.spoon, L.employers, L.faculties].map((lexemeId) => ({ lexemeId })),
  },
  1,
);
const identityPairs = ex(
  "match_pairs",
  { type: "match_pairs", pairs: [L.name, L.home, L.homesteads].map((lexemeId) => ({ lexemeId })) },
  1,
);
const greetPairs = ex(
  "match_pairs",
  { type: "match_pairs", pairs: [L.hello, L.hi].map((lexemeId) => ({ lexemeId })) },
  1,
);

function snapshot(): ReconcileSnapshot {
  return {
    oldUnit: {
      id: u(900),
      slug: "unit-1",
      status: "draft",
      skills: [
        {
          id: u(901),
          slug: "greetings",
          status: "draft",
          lessons: [{ id: u(902), order: 1, status: "draft", exercises: [card, leftover] }],
        },
        {
          id: u(903),
          slug: "clicks",
          status: "draft",
          lessons: [
            { id: u(904), order: 1, status: "draft", exercises: [drillB] },
            { id: u(905), order: 2, status: "draft", exercises: [drillA] },
          ],
        },
        { id: u(906), slug: "classes", status: "draft", lessons: [] },
      ],
    },
    newUnit: {
      id: u(800),
      slug: "greet-and-introduce",
      status: "draft",
      skills: [
        {
          id: u(801),
          slug: "greet-someone",
          status: "draft",
          lessons: [{ id: u(802), order: 1, status: "draft", exercises: [greetPairs] }],
        },
        {
          id: u(803),
          slug: "hear-the-three-clicks",
          status: "draft",
          lessons: [
            {
              id: u(804),
              order: 1,
              status: "draft",
              exercises: [pairsMixed, pairsAllBad, promptBad, optionBad],
            },
            { id: u(805), order: 2, status: "draft", exercises: [sortBad] },
          ],
        },
        {
          id: u(806),
          slug: "say-who-you-are",
          status: "draft",
          lessons: [{ id: u(807), order: 1, status: "draft", exercises: [identityPairs] }],
        },
      ],
    },
    notes: [
      {
        id: u(950),
        slug: "noun-classes",
        status: "ai_draft",
        order: 1,
        unitSlug: "unit-1",
        skillSlug: "classes",
      },
      {
        id: u(951),
        slug: "class-pairs",
        status: "ai_draft",
        order: 2,
        unitSlug: "unit-1",
        skillSlug: "classes",
      },
    ],
    skillIds: { "people/talk-about-more-than-one": u(960), "things/point-at-one-or-many": u(961) },
    lexemes,
    sentenceLexemes: {},
  };
}

const spec: ReconcileSpec = {
  oldUnitSlug: "unit-1",
  newUnitSlug: "greet-and-introduce",
  clickSkillSlug: "hear-the-three-clicks",
  cultureSkillSlug: "greet-someone",
  clickSets: ["A", "B"],
  themeBySkill: {
    "greet-someone": themes["greetings"]!,
    "hear-the-three-clicks": themes["clicks"]!,
    "say-who-you-are": themes["identity"]!,
  },
  notes: [
    { slug: "noun-classes", unitSlug: "people", skillSlug: "talk-about-more-than-one", order: 1 },
    { slug: "class-pairs", unitSlug: "things", skillSlug: "point-at-one-or-many", order: 1 },
  ],
  deleteOldUnit: false,
};

describe("reconciling unit-1 into greet-and-introduce", () => {
  const snap = snapshot();
  const plan = planReconcileUnit1(snap, spec);
  const kinds = plan.steps.map((s) => s.kind);

  it("opens the click skill on a new lesson of sets A and B, the others moved down", () => {
    expect(plan.steps.slice(0, 5)).toEqual([
      { kind: "shift_lesson", lessonId: u(805), skill: "hear-the-three-clicks", from: 2, to: 3 },
      { kind: "shift_lesson", lessonId: u(804), skill: "hear-the-three-clicks", from: 1, to: 2 },
      {
        kind: "create_lesson",
        ref: "click-identify",
        skillId: u(803),
        skill: "hear-the-three-clicks",
        order: 1,
      },
      expect.objectContaining({
        kind: "create_exercise",
        lesson: { created: "click-identify" },
        order: 1,
        payload: { type: "click_identify", set: "A", clicks: clickIdsForSet("A") },
      }),
      expect.objectContaining({
        kind: "create_exercise",
        order: 2,
        payload: { type: "click_identify", set: "B", clicks: clickIdsForSet("B") },
      }),
    ]);
  });

  it("moves the drills after the sets, in set order, and the card to greet-someone", () => {
    const moves = plan.steps.filter((s) => s.kind === "move_exercise");
    expect(
      moves.map((m) => [m.exerciseId, m.order, "id" in m.lesson ? m.lesson.id : m.lesson.created]),
    ).toEqual([
      [drillA.id, 3, "click-identify"],
      [drillB.id, 4, "click-identify"],
      [card.id, 2, u(802)],
    ]);
  });

  it("takes the off-topic words out, and drops what cannot stand without them", () => {
    const updates = new Map(
      plan.steps.flatMap((s) => (s.kind === "update_exercise" ? [[s.exerciseId, s] as const] : [])),
    );
    const deletes = new Map(
      plan.steps.flatMap((s) => (s.kind === "delete_exercise" ? [[s.exerciseId, s] as const] : [])),
    );
    expect(updates.get(pairsMixed.id)?.payload).toEqual({
      type: "match_pairs",
      pairs: [{ lexemeId: L.spoon }, { lexemeId: L.cut }],
    });
    expect(
      updates
        .get(pairsMixed.id)
        ?.removed.map((w) => w.lemma)
        .sort(),
    ).toEqual(["zz-cala zz-nxantathu /zz-engile", "zz-qeshi"].sort());
    expect(deletes.get(pairsAllBad.id)?.why).toMatch(/fewer than two pairs/);
    expect(deletes.get(promptBad.id)?.why).toMatch(/asks about is off-topic/);
    expect(updates.get(optionBad.id)?.payload).toMatchObject({
      options: [
        { lexemeId: L.spoon, correct: true },
        { lexemeId: L.cut, correct: false },
      ],
    });
    expect(deletes.get(sortBad.id)?.why).toMatch(/fewer than two words/);
    expect(updates.get(identityPairs.id)?.removed.map((w) => w.gloss)).toEqual(["homesteads"]);
    // Good words and moved exercises with good words are left alone.
    expect(updates.has(greetPairs.id) || deletes.has(greetPairs.id)).toBe(false);
    expect(updates.has(drillA.id) || deletes.has(drillA.id)).toBe(false);
  });

  it("moves the grammar notes to the plural skills", () => {
    expect(plan.steps.filter((s) => s.kind === "move_grammar_note")).toEqual([
      expect.objectContaining({ noteId: u(950), skillId: u(960), order: 1 }),
      expect.objectContaining({ noteId: u(951), skillId: u(961), order: 1 }),
    ]);
  });

  it("leaves the old unit draft and says what is still in it", () => {
    expect(kinds).not.toContain("delete_old_unit");
    expect(plan.oldUnitLeft).toEqual(["greetings/lesson 1/2 match_pairs (draft)"]);
    expect(plan.problems).toEqual([]);
  });

  it("lists the unit's words afterwards, with none of the off-topic ones", () => {
    const words = wordsAfter(snap, plan, spec);
    const all = words.flatMap((w) => w.words.map((x) => x.glosses.join("; ")));
    for (const bad of [
      "employers",
      "Legs",
      "faculties; departments",
      "paediatric wards",
      "sides; sections",
      "homesteads",
    ])
      expect(all).not.toContain(bad);
    expect(
      words.find((w) => w.skill === "hear-the-three-clicks")?.words.map((w) => w.lemma),
    ).toEqual(["zz-cephe", "zz-cheba", "zz-cinga", "zz-xoka"]);
  });

  it("does nothing on a second run", () => {
    // The state the first run leaves behind.
    const after: ReconcileSnapshot = {
      ...snap,
      oldUnit: {
        ...snap.oldUnit!,
        skills: snap.oldUnit!.skills.map((s) => ({
          ...s,
          lessons: s.lessons.map((l) => ({
            ...l,
            exercises: l.exercises.filter((e) => e.id === leftover.id),
          })),
        })),
      },
      newUnit: {
        ...snap.newUnit!,
        skills: snap.newUnit!.skills.map((s) =>
          s.slug === "hear-the-three-clicks"
            ? {
                ...s,
                lessons: [
                  {
                    id: u(810),
                    order: 1,
                    status: "draft",
                    exercises: [
                      ex(
                        "click_identify",
                        { type: "click_identify", set: "A", clicks: clickIdsForSet("A") },
                        1,
                      ),
                      ex(
                        "click_identify",
                        { type: "click_identify", set: "B", clicks: clickIdsForSet("B") },
                        2,
                      ),
                      { ...drillA, order: 3 },
                      { ...drillB, order: 4 },
                    ],
                  },
                  {
                    id: u(804),
                    order: 2,
                    status: "draft",
                    exercises: [
                      {
                        ...pairsMixed,
                        payload: {
                          type: "match_pairs",
                          pairs: [{ lexemeId: L.spoon }, { lexemeId: L.cut }],
                        },
                      },
                    ],
                  },
                ],
              }
            : s.slug === "say-who-you-are"
              ? {
                  ...s,
                  lessons: [
                    {
                      id: u(807),
                      order: 1,
                      status: "draft",
                      exercises: [
                        {
                          ...identityPairs,
                          payload: {
                            type: "match_pairs",
                            pairs: [{ lexemeId: L.name }, { lexemeId: L.home }],
                          },
                        },
                      ],
                    },
                  ],
                }
              : s.slug === "greet-someone"
                ? {
                    ...s,
                    lessons: [{ ...s.lessons[0]!, exercises: [greetPairs, { ...card, order: 2 }] }],
                  }
                : s,
        ),
      },
      notes: [
        {
          id: u(950),
          slug: "noun-classes",
          status: "ai_draft",
          order: 1,
          unitSlug: "people",
          skillSlug: "talk-about-more-than-one",
        },
        {
          id: u(951),
          slug: "class-pairs",
          status: "ai_draft",
          order: 1,
          unitSlug: "things",
          skillSlug: "point-at-one-or-many",
        },
      ],
    };
    expect(planReconcileUnit1(after, spec)).toMatchObject({ steps: [], problems: [] });
  });

  it("never moves content someone has sent to review", () => {
    const s = snapshot();
    const reviewed = { ...drillA, status: "in_review" as const };
    const withReview: ReconcileSnapshot = {
      ...s,
      oldUnit: {
        ...s.oldUnit!,
        skills: s.oldUnit!.skills.map((k) =>
          k.slug === "clicks"
            ? { ...k, lessons: [{ id: u(905), order: 2, status: "draft", exercises: [reviewed] }] }
            : k,
        ),
      },
    };
    const p = planReconcileUnit1(withReview, spec);
    expect(p.steps.some((x) => x.kind === "move_exercise" && x.exerciseId === drillA.id)).toBe(
      false,
    );
    expect(p.problems.join("\n")).toMatch(/in_review; only a draft moves/);
  });

  it("deletes the old unit only when asked, and not while a grammar note would go with it", () => {
    const asked = planReconcileUnit1(snapshot(), { ...spec, deleteOldUnit: true });
    expect(asked.steps.at(-1)).toMatchObject({ kind: "delete_old_unit", unitId: u(900) });

    const noTarget = planReconcileUnit1(
      { ...snapshot(), skillIds: {} },
      { ...spec, deleteOldUnit: true },
    );
    expect(noTarget.steps.some((x) => x.kind === "delete_old_unit")).toBe(false);
    expect(noTarget.problems.join("\n")).toMatch(/grammar note noun-classes has not moved/);
  });

  it("says so, and plans nothing, when the spine unit has not been curated", () => {
    const p = planReconcileUnit1({ ...snapshot(), newUnit: null }, spec);
    expect(p.steps).toEqual([]);
    expect(p.problems[0]).toMatch(/molo content curate/);
  });
});

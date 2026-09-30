import { describe, expect, it } from "vitest";

import { parseCorpus } from "./adapters/spoken-xhosa-gu.ts";
import { planCuration, type CurationLexeme } from "./curate.ts";
import { parseSpine, parseThemes } from "./curriculum/spine.ts";

const spine = parseSpine({
  header: ["PROPOSAL"],
  version: 1,
  course: "xhosa",
  units: [
    {
      slug: "people",
      order: 1,
      cefrBand: "A1",
      titleKey: "curriculum.units.people.title",
      title: { en: "Talk about people", nb: "Snakk om folk" },
      skills: [
        {
          slug: "name-people",
          order: 1,
          kind: "vocab",
          theme: "people",
          targetNewWords: 2,
          titleKey: "curriculum.units.people.skills.name-people.title",
          title: { en: "Name people", nb: "Sett navn på folk" },
          grammar: "class 1",
        },
      ],
    },
    {
      slug: "food",
      order: 2,
      cefrBand: "A1",
      titleKey: "curriculum.units.food.title",
      title: { en: "Order food", nb: "Bestill mat" },
      skills: [
        {
          slug: "name-food",
          order: 1,
          kind: "vocab",
          theme: "food",
          targetNewWords: 4,
          titleKey: "curriculum.units.food.skills.name-food.title",
          title: { en: "Name food", nb: "Sett navn på mat" },
          grammar: "mass nouns",
        },
      ],
    },
  ],
});

const themes = parseThemes({
  header: ["PROPOSAL"],
  version: 1,
  themes: {
    people: { note: "people", senses: ["child"], keywords: ["person", "child"], exclude: [] },
    food: { note: "food", senses: ["meat", "eat"], keywords: ["meat", "eat"], exclude: [] },
  },
});

const lex = (
  id: string,
  lemma: string,
  pos: string,
  nounClassLabel: string | null,
  glosses: string[],
  frequencyRank: number | null,
): CurationLexeme => ({
  id,
  lemma,
  pos,
  nounClassLabel,
  infinitive: null,
  glosses,
  frequencyRank,
  cefrBand: null,
});

const LEXICON = [
  lex("child", "umntwana", "noun", "1", ["child"], 3),
  lex("person", "umntu", "noun", "1", ["person"], 1),
  lex("woman", "umfazi", "noun", "1", ["person", "woman"], 99),
  lex("meat", "inyama", "noun", "9", ["meat"], 2),
  lex("eat", "tya", "verb", null, ["eat"], 4),
  lex("unranked", "ixhwele", "noun", "5", ["meat"], null),
];

const XML = `<corpus id="xhosa"><text filename="R1">
  <sentence id="s1" translation="The child is eating meat.">
    <token normalized="Umntwana" segmented="um-ntwana" pos="N" sense="child">Umntwana</token>
    <token normalized="utya" segmented="u-ty-a" pos="V" sense="eat">utya</token>
    <token normalized="inyama" segmented="i-nyama" pos="N" sense="meat">inyama</token>
    <token normalized="." segmented="_" pos="PUNC">.</token>
  </sentence>
  <sentence id="s2" translation="The person sees a mountain.">
    <token normalized="Umntu" segmented="um-ntu" pos="N" sense="person">Umntu</token>
    <token normalized="ubona" segmented="u-bon-a" pos="V" sense="see">ubona</token>
    <token normalized="intaba" segmented="i-ntaba" pos="N" sense="mountain">intaba</token>
    <token normalized="." segmented="_" pos="PUNC">.</token>
  </sentence>
  <sentence id="s3" translation="The child eats the mountain of the woman.">
    <token normalized="Umntwana" segmented="um-ntwana" pos="N" sense="child">Umntwana</token>
    <token normalized="utya" segmented="u-ty-a" pos="V" sense="eat">utya</token>
    <token normalized="intaba" segmented="i-ntaba" pos="N" sense="mountain">intaba</token>
    <token normalized="ilanga" segmented="i-langa" pos="N" sense="sun">ilanga</token>
  </sentence>
</text></corpus>`;

const corpus = parseCorpus(XML);
const plan = planCuration(spine, themes, LEXICON, corpus, { sentencesPerSkill: 3 });

const skill = (slug: string) => plan.skills.find((s) => s.skillSlug === slug);

describe("choosing words", () => {
  it("fills a skill from its theme in frequency order", () => {
    expect(skill("name-people")?.words.map((w) => w.lemma)).toEqual(["umntu", "umntwana"]);
  });

  it("stops at the target and reports the words it could not use", () => {
    // umfazi also matches "person" but the target was 2.
    expect(skill("name-people")?.wordGap).toBe(0);
    expect(skill("name-people")?.words).toHaveLength(2);
  });

  it("puts an unranked word last rather than dropping it", () => {
    const food = skill("name-food")?.words.map((w) => w.lemma) ?? [];
    expect(food).toEqual(["inyama", "tya", "ixhwele"]);
    expect(skill("name-food")?.wordGap).toBe(1);
  });

  it("never teaches the same word twice", () => {
    const all = plan.skills.flatMap((s) => s.words.map((w) => w.lexemeId));
    expect(new Set(all).size).toBe(all.length);
  });

  it("records why each word is where it is", () => {
    const w = skill("name-food")?.words.find((x) => x.lemma === "inyama");
    expect(w?.why.rule).toBe("sense");
    expect(w?.why.matched).toBe("meat");
  });
});

describe("choosing sentences", () => {
  it("takes only sentences the skill's vocabulary can carry", () => {
    // s1 needs child, eat, meat: all taught by the time food runs.
    expect(skill("name-food")?.sentences.map((s) => s.corpusId)).toEqual(["s1"]);
  });

  it("counts unknown content words and honours the limit", () => {
    // s2 ("Umntu ubona intaba") has two words outside the lexicon entirely,
    // so it needs a budget of two. s1 needs none.
    const strict = planCuration(spine, themes, LEXICON, corpus, { maxUnknown: 0 });
    expect(strict.skills.flatMap((s) => s.sentences.map((x) => x.corpusId))).toEqual(["s1"]);
    const loose = planCuration(spine, themes, LEXICON, corpus, { maxUnknown: 2 });
    expect(loose.totals.sentences).toBeGreaterThan(plan.totals.sentences);
    expect(loose.skills.flatMap((s) => s.sentences.map((x) => x.corpusId))).toContain("s2");
  });

  it("never gives one sentence to two skills", () => {
    const ids = plan.skills.flatMap((s) => s.sentences.map((x) => x.corpusId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries the corpus's own text, translation and reference", () => {
    const s = skill("name-food")?.sentences[0];
    expect(s?.textXh).toBe("Umntwana utya inyama.");
    expect(s?.translation).toBe("The child is eating meat.");
    expect(s?.sourceRef).toBe("xhosa.xml:text=R1;sentence=s1");
  });

  it("maps every taught token to a lexeme and a surface form from the corpus", () => {
    expect(skill("name-food")?.sentences[0]?.tokens).toEqual([
      { position: 0, lexemeId: "child", surfaceForm: "Umntwana" },
      { position: 1, lexemeId: "eat", surfaceForm: "utya" },
      { position: 2, lexemeId: "meat", surfaceForm: "inyama" },
    ]);
  });

  it("counts what the filter threw away", () => {
    expect(plan.sentencesConsidered).toBe(3);
    expect(plan.sentencesUnplaced).toBe(2);
  });
});

describe("generating exercises", () => {
  it("makes a match-pairs set from the skill's words", () => {
    const ex = skill("name-people")?.lessons.flatMap((l) => l.exercises) ?? [];
    expect(ex.filter((e) => e.type === "match_pairs")).toHaveLength(1);
  });

  it("gives listen_select exactly one correct answer's worth of options", () => {
    const ex = skill("name-food")
      ?.lessons.flatMap((l) => l.exercises)
      .find((e) => e.type === "listen_select");
    expect(ex && ex.type === "listen_select" && ex.optionLexemeIds[0]).toBe(ex?.promptLexemeId);
  });

  it("never offers two options that read the same (audit M02)", () => {
    // In the fixture, inyama and ixhwele are both glossed "meat".
    const ex = skill("name-food")?.lessons.flatMap((l) => l.exercises) ?? [];
    const glossOf = (id: string) => LEXICON.find((l) => l.id === id)?.glosses[0];
    const tileSets = ex.flatMap((e) =>
      e.type === "listen_select"
        ? [e.optionLexemeIds]
        : e.type === "match_pairs"
          ? [e.lexemeIds]
          : [],
    );
    expect(tileSets.length).toBeGreaterThan(0);
    for (const ids of tileSets) {
      const glosses = ids.map(glossOf);
      expect(new Set(glosses).size).toBe(glosses.length);
    }
    const meat = ex.find((e) => e.type === "listen_select" && e.promptLexemeId === "meat");
    expect(meat?.type === "listen_select" && meat.optionLexemeIds).not.toContain("unranked");
  });

  it("makes one tap and one type per accepted sentence", () => {
    const ex = skill("name-food")?.lessons.flatMap((l) => l.exercises) ?? [];
    expect(ex.filter((e) => e.type === "translate_tap")).toHaveLength(1);
    expect(ex.filter((e) => e.type === "translate_type")).toHaveLength(1);
  });

  it("only sorts classes when there is a contrast to sort into", () => {
    // name-people is all class 1, so there is nothing to sort.
    const people = skill("name-people")?.lessons.flatMap((l) => l.exercises) ?? [];
    expect(people.filter((e) => e.type === "class_sort")).toHaveLength(0);
  });

  it("generates no exercise that would need a recording or an invented form", () => {
    const types = new Set(
      plan.skills.flatMap((s) => s.lessons.flatMap((l) => l.exercises.map((e) => e.type))),
    );
    for (const forbidden of ["speak", "select_listen", "click_drill", "concord_fill"]) {
      expect(types.has(forbidden as never)).toBe(false);
    }
    expect(plan.notGenerated.map((n) => n.type)).toContain("concord_fill");
  });

  it("says concord_fill is empty because no class is validated", () => {
    const reason = plan.notGenerated.find((n) => n.type === "concord_fill")?.reason;
    expect(reason).toMatch(/tutor-validated/);
  });
});

describe("what the leftovers are waiting for", () => {
  // The curation loop asks which sentences fit the words. This asks the
  // question an editor actually has: which words would fit the sentences.
  const UNPLACED_XML = `<corpus id="xhosa"><text filename="R2">
  <sentence id="u1" translation="The child eats the sun.">
    <token normalized="Umntwana" segmented="um-ntwana" pos="N" sense="child">Umntwana</token>
    <token normalized="utya" segmented="u-ty-a" pos="V" sense="eat">utya</token>
    <token normalized="ilanga" segmented="i-langa" pos="N" sense="sun">ilanga</token>
  </sentence>
  <sentence id="u2" translation="The person sees the sun.">
    <token normalized="Umntu" segmented="um-ntu" pos="N" sense="person">Umntu</token>
    <token normalized="ubona" segmented="u-bon-a" pos="V" sense="see">ubona</token>
    <token normalized="Ilanga" segmented="i-langa" pos="N" sense="sun">Ilanga</token>
  </sentence>
</text></corpus>`;
  // maxUnknown 0 keeps both out of a skill, which is what makes them leftovers.
  const strict = planCuration(spine, themes, LEXICON, parseCorpus(UNPLACED_XML), {
    maxUnknown: 0,
  });
  const find = (form: string) => strict.unlock.find((u) => u.form === form);

  it("counts a sentence held up by exactly one untaught word", () => {
    // u1 is child + eat, both taught, and ilanga. One word short.
    expect(strict.sentencesOneWordShort).toBe(1);
  });

  it("ranks the word that unlocks a sentence on its own above one that does not", () => {
    expect(strict.unlock[0]?.form).toBe("ilanga");
    expect(find("ilanga")?.blocks).toBe(1);
    expect(find("ubona")?.blocks).toBe(0);
  });

  it("counts a word once per sentence it appears in, however it was capitalised", () => {
    // `ilanga` in u1 and `Ilanga` in u2 are the same missing word.
    expect(find("ilanga")?.appearsIn).toBe(2);
    expect(strict.unlock.filter((u) => u.form.toLowerCase() === "ilanga")).toHaveLength(1);
  });

  it("says whether the lexicon already holds the word", () => {
    // Neither the sun nor seeing is in this fixture's lexicon.
    expect(find("ilanga")?.lexemeId).toBeNull();
    expect(find("ilanga")?.gloss).toBeNull();
  });

  it("ignores a sentence that teaches no taught word at all", () => {
    const nothing = `<corpus id="xhosa"><text filename="R3">
  <sentence id="n1" translation="The sun sees the mountain.">
    <token normalized="Ilanga" segmented="i-langa" pos="N" sense="sun">Ilanga</token>
    <token normalized="ubona" segmented="u-bon-a" pos="V" sense="see">ubona</token>
    <token normalized="intaba" segmented="i-ntaba" pos="N" sense="mountain">intaba</token>
  </sentence>
</text></corpus>`;
    const p = planCuration(spine, themes, LEXICON, parseCorpus(nothing), { maxUnknown: 0 });
    expect(p.unlock).toHaveLength(0);
  });
});

describe("a pronunciation skill with click sets", () => {
  const withClicks = parseSpine({
    header: ["PROPOSAL"],
    version: 1,
    course: "xhosa",
    units: [
      {
        slug: "sounds",
        order: 1,
        cefrBand: "A1",
        titleKey: "curriculum.units.sounds.title",
        title: { en: "Sounds", nb: "Lyder" },
        skills: [
          {
            slug: "hear-clicks",
            order: 1,
            kind: "pronunciation",
            theme: "people",
            targetNewWords: 2,
            titleKey: "curriculum.units.sounds.skills.hear-clicks.title",
            title: { en: "Hear clicks", nb: "Hør klikk" },
            grammar: "c, x, q",
            clickIdentifySets: ["A", "B"],
          },
        ],
      },
    ],
  });
  const p = planCuration(withClicks, themes, LEXICON, corpus, { sentencesPerSkill: 0 });
  const s = p.skills[0]!;

  it("opens on a lesson of bare-click sets, before any word", () => {
    expect(s.lessons[0]).toEqual({
      order: 1,
      exercises: [
        { type: "click_identify", set: "A" },
        { type: "click_identify", set: "B" },
      ],
    });
    const rest = s.lessons.slice(1);
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.map((l) => l.order)).toEqual(rest.map((_, i) => i + 2));
    expect(rest.flatMap((l) => l.exercises.map((e) => e.type))).not.toContain("click_identify");
    expect(s.exerciseCounts["click_identify"]).toBe(2);
  });

  it("gives a skill without sets no click lesson", () => {
    const types = plan.skills.flatMap((k) =>
      k.lessons.flatMap((l) => l.exercises.map((e) => e.type)),
    );
    expect(types).not.toContain("click_identify");
  });
});

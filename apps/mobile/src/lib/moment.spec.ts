import { EMPTY_GUEST, withLesson, type GuestProgress } from "./guest-logic.ts";
import { badgeFor, momentOf } from "./moment.ts";

const A = "00000000-0000-4000-8000-00000000aaaa";
const B = "00000000-0000-4000-8000-00000000bbbb";

const lesson = (id: string, teaches: string[]) => ({
  lessonId: id,
  unitSlug: "zz-unit",
  correct: 1,
  total: 1,
  xp: 10,
  today: "2026-09-04",
  teaches,
});

describe("the badge above the prompt", () => {
  it("takes the server's word for a signed-in learner", () => {
    expect(momentOf({ moment: "tricky", teaches: [A] }, null)).toBe("tricky");
    expect(momentOf({ moment: null, teaches: [A] }, null)).toBeNull();
    expect(momentOf({ teaches: [A] }, null)).toBeNull();
  });

  it("answers for itself when the learner is a guest", () => {
    // The server sends null to a guest; the device knows better.
    expect(momentOf({ moment: null, teaches: [A] }, EMPTY_GUEST)).toBe("new_word");
    const met: GuestProgress = withLesson(EMPTY_GUEST, lesson("l1", [A]));
    expect(momentOf({ moment: null, teaches: [A] }, met)).toBeNull();
    expect(momentOf({ moment: null, teaches: [B] }, met)).toBe("new_word");
  });

  it("calls a word the guest missed tricky, and clears it when they get it right", () => {
    const missed = withLesson(EMPTY_GUEST, lesson("l1", [A, B]), [A]);
    expect(momentOf({ moment: null, teaches: [A] }, missed)).toBe("tricky");
    expect(momentOf({ moment: null, teaches: [B] }, missed)).toBeNull();

    const cleared = withLesson(missed, lesson("l1", [A, B]), []);
    expect(momentOf({ moment: null, teaches: [A] }, cleared)).toBeNull();
  });

  it("says nothing for an exercise that teaches no word of its own", () => {
    expect(momentOf({ moment: null, teaches: [] }, EMPTY_GUEST)).toBeNull();
    expect(momentOf({ moment: null }, EMPTY_GUEST)).toBeNull();
  });

  it("draws the sun for a new word and the coral for a tricky one", () => {
    expect(badgeFor("new_word")).toEqual({
      moment: "new_word",
      labelKey: "lesson.moment.newWord",
      tone: "sun",
    });
    expect(badgeFor("tricky")).toEqual({
      moment: "tricky",
      labelKey: "lesson.moment.tricky",
      tone: "coral",
    });
    expect(badgeFor(null)).toBeNull();
  });
});

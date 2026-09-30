import {
  EMPTY_GUEST,
  GUEST_FREE_LESSONS,
  guestMustSignUp,
  guestXp,
  parseGuest,
  withLesson,
  type GuestLesson,
} from "./guest-logic.ts";

const lesson = (id: string, xp = 40): GuestLesson => ({
  lessonId: id,
  unitSlug: "unit-1",
  correct: 4,
  total: 5,
  xp,
  today: "2026-09-04",
});

describe("guest progress", () => {
  it("allows the free lesson, then walls the next one", () => {
    expect(GUEST_FREE_LESSONS).toBe(1);
    expect(guestMustSignUp(EMPTY_GUEST, "l1")).toBe(false);
    const g = withLesson(EMPTY_GUEST, lesson("l1"));
    expect(guestMustSignUp(g, "l2")).toBe(true);
  });

  it("lets a finished lesson be replayed and keeps the newest score", () => {
    const g = withLesson(withLesson(EMPTY_GUEST, lesson("l1", 40)), lesson("l1", 55));
    expect(guestMustSignUp(g, "l1")).toBe(false);
    expect(g.lessons).toHaveLength(1);
    expect(guestXp(g)).toBe(55);
  });

  it("sums XP across lessons", () => {
    const g = withLesson(withLesson(EMPTY_GUEST, lesson("l1", 40)), lesson("l2", 25));
    expect(guestXp(g)).toBe(65);
  });

  it("reads a corrupt or foreign value as empty", () => {
    expect(parseGuest("not json")).toEqual(EMPTY_GUEST);
    expect(parseGuest('{"lessons":"nope"}')).toEqual(EMPTY_GUEST);
    expect(parseGuest('{"lessons":[{"lessonId":"l1"}]}')).toEqual(EMPTY_GUEST);
    expect(parseGuest(JSON.stringify({ lessons: [lesson("l1")] })).lessons).toHaveLength(1);
  });
});

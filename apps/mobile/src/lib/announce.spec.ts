import { announcementFor } from "./announce.ts";

/**
 * The rule the hook owns: say a new thing once, and do not repeat it because
 * the component re-rendered. A screen reader that reads the verdict twice is
 * worse than one that reads it late.
 */
describe("announcementFor", () => {
  it("says a message nothing has said yet", () => {
    expect(announcementFor("Correct", null)).toBe("Correct");
  });

  it("says nothing when the message has not changed", () => {
    expect(announcementFor("Correct", "Correct")).toBeNull();
  });

  it("says the next message when it differs", () => {
    expect(announcementFor("Not quite", "Correct")).toBe("Not quite");
  });

  it("treats empty, blank and absent as nothing to say", () => {
    expect(announcementFor("", null)).toBeNull();
    expect(announcementFor("   ", null)).toBeNull();
    expect(announcementFor(null, null)).toBeNull();
    expect(announcementFor(undefined, "Correct")).toBeNull();
  });

  it("compares on the trimmed text, so whitespace alone is not a new message", () => {
    expect(announcementFor("  Correct  ", "Correct")).toBeNull();
    expect(announcementFor("  Correct  ", null)).toBe("Correct");
  });
});

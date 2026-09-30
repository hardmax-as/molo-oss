import type { LessonHeartsView } from "@molo/core/lesson";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { LessonHearts } from "./LessonHearts.tsx";

// The libraries' own Jest stand-ins: no native worklet runtime under Node.
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => jest.requireActual("react-native-reanimated/mock"));
jest.mock("~/lib/i18n.tsx", () => ({
  useT: () => (key: string, values?: Record<string, number>) =>
    values ? `${key}:${values["hearts"]}/${values["max"]}` : key,
}));
const mockAnnounce = jest.fn();
jest.mock("~/lib/announce.ts", () => ({
  useAnnounce: (message: string | null) => mockAnnounce(message),
}));
let mockReduced = false;
jest.mock("~/ui/motion.ts", () => ({
  useMotion: () => ({ reduced: mockReduced, enter: 220, stagger: 40, particles: !mockReduced }),
}));

const count = (hearts: number): LessonHeartsView => ({ kind: "count", hearts, max: 5 });

async function render(view: LessonHeartsView): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<LessonHearts view={view} />);
  });
  return tree;
}

const hearts = (tree: ReactTestRenderer) =>
  tree.root.find((n) => n.props.testID === "lesson-hearts" && n.props.accessible === true);
const drops = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => n.props.testID === "lesson-hearts-drop" && typeof n.type !== "string");

describe("hearts in the lesson strip", () => {
  beforeEach(() => {
    mockReduced = false;
    mockAnnounce.mockClear();
  });

  it("shows nothing for a guest and infinity for Plus", async () => {
    expect((await render({ kind: "none" })).toJSON()).toBeNull();
    const plus = await render({ kind: "unlimited" });
    expect(hearts(plus).props.accessibilityLabel).toBe("hearts.unlimited");
  });

  it("names the count, and plays no loss it never saw", async () => {
    const tree = await render(count(3));
    expect(hearts(tree).props.accessibilityLabel).toBe("hearts.count:3/5");
    expect(drops(tree)).toHaveLength(0);
  });

  it("drops a heart and says so when the count goes down", async () => {
    const tree = await render(count(5));
    await act(async () => tree.update(<LessonHearts view={count(4)} />));
    expect(hearts(tree).props.accessibilityLabel).toBe("hearts.lost:4/5");
    expect(hearts(tree).props.accessibilityLiveRegion).toBe("polite");
    expect(mockAnnounce).toHaveBeenLastCalledWith("hearts.lost:4/5");
    expect(drops(tree)).toHaveLength(1);
    // A heart coming back is not a loss: nothing new falls.
    await act(async () => tree.update(<LessonHearts view={count(5)} />));
    expect(drops(tree)).toHaveLength(1);
  });

  it("only changes the number under reduced motion, and still says it", async () => {
    mockReduced = true;
    const tree = await render(count(2));
    await act(async () => tree.update(<LessonHearts view={count(1)} />));
    expect(hearts(tree).props.accessibilityLabel).toBe("hearts.lost:1/5");
    expect(mockAnnounce).toHaveBeenLastCalledWith("hearts.lost:1/5");
    expect(drops(tree)).toHaveLength(0);
  });
});

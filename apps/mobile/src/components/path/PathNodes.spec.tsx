import type { PathLessonRow } from "@molo/core";
import { StyleSheet } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { LessonNode, SHIFT } from "./PathNodes.tsx";

// The libraries' own Jest stand-ins: no native worklet runtime under Node.
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
// The mock keeps createAnimatedComponent on its default export only.
jest.mock("react-native-reanimated", () => {
  const mock = jest.requireActual("react-native-reanimated/mock");
  return { ...mock, createAnimatedComponent: mock.default.createAnimatedComponent };
});
jest.mock("expo-router", () => ({ useIsFocused: () => true }));
jest.mock("~/lib/i18n.tsx", () => ({
  useT: () => (key: string) => key,
  useContentTitle: () => (key: string) => key,
}));
jest.mock("~/ui/motion.ts", () => ({
  useMotion: () => ({ reduced: false, enter: 220, stagger: 40, particles: true }),
}));
jest.mock("~/ui/Mascots.tsx", () => ({ Crane: () => null }));
jest.mock("~/ui/PathIcons.tsx", () => ({ ChestIcon: () => null, NodeIcon: () => null }));

function lesson(offset: -1 | 0 | 1, state: PathLessonRow["state"]): PathLessonRow {
  return {
    type: "lesson",
    key: `lesson:${offset}`,
    index: 1,
    unitId: "unit",
    unitSlug: "unit",
    skillId: "skill",
    lessonId: `lesson-${offset}`,
    order: 2,
    kind: "listen",
    state,
    crownLevel: 0,
    estimatedMinutes: 2,
    exerciseCount: 2,
    offset,
  };
}

async function render(row: PathLessonRow): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<LessonNode row={row} onPress={() => {}} />);
  });
  return tree;
}

/** Every translateX on the way from the node's button up to the root. */
function shiftsAbove(tree: ReactTestRenderer): number[] {
  const button = tree.root.find((n) => n.props.testID === "lesson-2" && typeof n.type !== "string");
  const found: number[] = [];
  for (let n = button.parent; n; n = n.parent) {
    const style = StyleSheet.flatten(n.props.style) as
      | { transform?: readonly Record<string, number>[] }
      | undefined;
    for (const t of style?.transform ?? []) if ("translateX" in t) found.push(t.translateX!);
  }
  return found;
}

describe("a node on the winding", () => {
  // The idle pulse is a transform as well: on the same view it replaced the
  // shift, every node sat on the centre line and the trail missed it.
  it.each([
    [1, "open"],
    [-1, "open"],
    [1, "current"],
  ] as const)("keeps its shift of %d when %s", async (offset, state) => {
    const tree = await render(lesson(offset, state));
    expect(shiftsAbove(tree)).toContain(SHIFT[String(offset) as "1"]);
  });
});

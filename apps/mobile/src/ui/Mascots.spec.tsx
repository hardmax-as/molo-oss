import type { ComponentType } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { Crane, Penguin, RIM_COLOUR, rimWidth, Sunbird, type MascotSurface } from "./Mascots.tsx";
import { colors } from "./theme.ts";

// Reanimated needs a native runtime; the bob is not what is under test.
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  const same = (v: unknown) => v;
  return {
    __esModule: true,
    default: { View },
    Easing: { inOut: same, quad: same },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withRepeat: same,
    withSequence: same,
    withTiming: same,
  };
});
jest.mock("./motion.ts", () => ({ useMotion: () => ({ reduced: true }) }));

type Bird = ComponentType<{
  pose?: "hello" | "cheer" | "listen";
  size?: number;
  surface?: MascotSurface;
}>;
const BIRDS: [string, Bird][] = [
  ["penguin", Penguin],
  ["sunbird", Sunbird],
  ["crane", Crane],
];

async function draw(
  Bird: Bird,
  surface?: MascotSurface,
  pose: "hello" | "cheer" | "listen" = "cheer",
) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Bird pose={pose} size={132} {...(surface ? { surface } : {})} />);
  });
  return tree;
}

/** The rim group: the silhouette again, in the rim colour, stroked. */
const rims = (tree: ReactTestRenderer): ReactTestInstance[] =>
  tree.root.findAll(
    (n) =>
      typeof n.type !== "string" && n.props.fill === RIM_COLOUR && n.props.stroke === RIM_COLOUR,
  );

/** Every drawn shape in paint order (react-native-svg's own components). */
const shapes = (tree: ReactTestRenderer) =>
  tree.root.findAll(
    (n) =>
      typeof n.type !== "string" &&
      ["Path", "Ellipse", "Circle"].includes((n.type as { name?: string }).name ?? ""),
  );

describe("mascots on a dark surface", () => {
  it.each(BIRDS)("the %s gets a cream rim under the whole silhouette", async (_, Bird) => {
    const tree = await draw(Bird, "dark");
    const rim = rims(tree);
    expect(rim).toHaveLength(1);
    expect(rim[0]!.props.strokeWidth).toBe(rimWidth(132));
    // Several outline pieces, painted before anything of the bird itself.
    const pieces = rim[0]!.findAll(
      (n) =>
        typeof n.type !== "string" &&
        ["Path", "Ellipse", "Circle"].includes((n.type as { name?: string }).name ?? ""),
    );
    expect(pieces.length).toBeGreaterThanOrEqual(5);
    expect(shapes(tree)[0]).toBe(pieces[0]);
    await act(async () => tree.unmount());
  });

  it.each(BIRDS)("the %s has no rim on a light surface, the default", async (_, Bird) => {
    const light = await draw(Bird, "light");
    expect(rims(light)).toHaveLength(0);
    await act(async () => light.unmount());
    const unset = await draw(Bird);
    expect(rims(unset)).toHaveLength(0);
    await act(async () => unset.unmount());
  });

  it("keeps the penguin's own colours: the rim is added, the indigo body stays", async () => {
    const dark = await draw(Penguin, "dark");
    const light = await draw(Penguin, "light");
    const fills = (t: ReactTestRenderer) =>
      shapes(t)
        .map((n) => n.props.fill)
        .filter((f) => f !== undefined && f !== RIM_COLOUR);
    expect(fills(dark)).toEqual(fills(light));
    expect(fills(dark)).toContain(colors.indigo);
    await act(async () => dark.unmount());
    await act(async () => light.unmount());
  });

  it("turns the listening arcs light, where indigo would vanish", async () => {
    const tree = await draw(Penguin, "dark", "listen");
    const arcs = tree.root.findAll(
      (n) =>
        typeof n.type !== "string" && n.props.opacity === "0.5" && n.props.stroke !== undefined,
    );
    expect(arcs[0]!.props.stroke).toBe(colors.cloud);
    await act(async () => tree.unmount());
  });
});

describe("rimWidth", () => {
  it("shows about the same rim in points whatever the size, within bounds", () => {
    // Half the stroke shows; in points that is width / 2 * size / 200.
    const shown = (size: number) => ((rimWidth(size) / 2) * size) / 200;
    for (const size of [72, 88, 96, 100, 112, 132, 160]) {
      expect(shown(size)).toBeCloseTo(2.5, 5);
    }
    expect(rimWidth(20)).toBe(16);
    expect(rimWidth(1000)).toBe(5);
  });
});

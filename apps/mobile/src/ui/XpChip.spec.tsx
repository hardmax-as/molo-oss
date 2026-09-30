import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { XpChip } from "./XpChip.tsx";

jest.mock("./motion.ts", () => ({ useMotion: () => ({ reduced: true }) }));
jest.mock("./count-up.ts", () => ({ useCountUp: (n: number) => n }));
jest.mock("./Glass.tsx", () => ({ Glass: () => null }));

let mounted: ReactTestRenderer | null = null;
afterEach(async () => {
  await act(async () => mounted?.unmount());
  mounted = null;
});

async function classes(props: Parameters<typeof XpChip>[0]) {
  await act(async () => {
    mounted = create(<XpChip {...props} />);
  });
  const pill = mounted!.root.find((n) => n.props.accessibilityLabel?.endsWith?.("XP"));
  const text = pill.find(
    (n) => typeof n.props.className === "string" && n.props.className.includes("font-display-bold"),
  );
  return { pill: String(pill.props.className), text: String(text.props.className) };
}

describe("XpChip", () => {
  it("in a row of chips it is small and on the row's centre line", async () => {
    const c = await classes({ xp: 0, signed: false, size: "sm", align: "center" });
    expect(c.pill).toContain("self-center");
    expect(c.pill).not.toContain("self-start");
    expect(c.text).toContain("text-sm");
  });

  it("keeps its old look by default", async () => {
    const c = await classes({ xp: 12 });
    expect(c.pill).toContain("self-start");
    expect(c.text).toContain("text-base");
  });
});

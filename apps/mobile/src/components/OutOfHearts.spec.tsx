import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OutOfHearts } from "./OutOfHearts.tsx";

const mockPush = jest.fn();

// The libraries' own Jest stand-ins: no native worklet runtime under Node.
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => jest.requireActual("react-native-reanimated/mock"));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("~/lib/i18n.tsx", () => ({ useT: () => (key: string) => key }));
jest.mock("~/ui/motion.ts", () => ({ useMotion: () => ({ enter: 0 }) }));
jest.mock("~/ui/Mascots.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return { Penguin: (props: object) => createElement("mock-penguin", props) };
});
jest.mock("~/ui/Button.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return {
    Button: (props: { label: string; testID?: string; onPress: () => void }) =>
      createElement("mock-button", props),
  };
});
// The bug this guards: out of hearts used to open a native sheet, and
// navigating from inside it was swallowed on iOS. The card must never use one.
jest.mock("~/ui/Sheet.tsx", () => ({
  Sheet: () => {
    throw new Error("OutOfHearts must not present a native sheet");
  },
}));
jest.mock("~/ui/native-ui.ts", () => ({ nativeUiAvailable: () => true, expoUi: () => ({}) }));

const state = { hearts: 0, max: 5, nextRegenAt: null, practiceLeft: 5 } as never;

let mounted: ReactTestRenderer | null = null;

async function render(onLater?: () => void): Promise<ReactTestRenderer> {
  await act(async () => {
    mounted = create(<OutOfHearts state={state} onLater={onLater} />);
  });
  return mounted!;
}

const button = (r: ReactTestRenderer, id: string) =>
  r.root.find((n) => n.type === "mock-button" && n.props.testID === id);

afterEach(async () => {
  await act(async () => mounted?.unmount());
  mounted = null;
  mockPush.mockReset();
});

describe("OutOfHearts", () => {
  it("is a card in the page even where native sheets are available", async () => {
    const r = await render(() => undefined);
    expect(r.root.findAll((n) => n.props.testID === "out-of-hearts").length).toBeGreaterThan(0);
  });

  it("Continue later leaves through the callback", async () => {
    const onLater = jest.fn();
    const r = await render(onLater);
    await act(async () => button(r, "hearts-later").props.onPress());
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it("Practise and Get Plus navigate", async () => {
    const r = await render(() => undefined);
    await act(async () => button(r, "hearts-practise").props.onPress());
    await act(async () => button(r, "hearts-plus").props.onPress());
    expect(mockPush.mock.calls).toEqual([["/review"], ["/plus"]]);
  });

  it("has no Later button without a way back", async () => {
    const r = await render();
    expect(r.root.findAll((n) => n.props.testID === "hearts-later")).toHaveLength(0);
  });
});

import type { UnitResponse } from "@molo/core";
import { Text } from "react-native";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { offlineStateOf, UnitDownload } from "./UnitDownload.tsx";

const mockPush = jest.fn();
const mockStart = jest.fn();
const mockCancel = jest.fn();
const mockDelete = jest.fn();
const mockLight = jest.fn(() => Promise.resolve());
let mockPlan: "free" | "plus" = "free";
let mockNative = true;
let mockReady = new Map<string, { bytes: number }>();
let mockActive = new Map<string, { done: number; total: number; bytes: number }>();
let mockFailed = new Map<string, string>();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("~/lib/plus.tsx", () => ({ usePlus: () => ({ plan: mockPlan }) }));
jest.mock("~/lib/use-downloads.ts", () => ({
  downloadKey: (slug: string, lang: string) => `${slug}:${lang}`,
  useDownloads: () => ({ ready: mockReady, active: mockActive, failed: mockFailed }),
  startDownload: (slug: string, lang: string) => mockStart(slug, lang),
  cancelDownload: (slug: string, lang: string) => mockCancel(slug, lang),
  deleteDownload: (slug: string, lang: string) => mockDelete(slug, lang),
}));
jest.mock("~/lib/i18n.tsx", () => ({ useT: () => (key: string) => key }));
jest.mock("~/ui/haptics.ts", () => ({ haptic: { light: () => mockLight() } }));
jest.mock("~/ui/native-ui.ts", () => ({ nativeUiAvailable: () => mockNative }));
jest.mock("~/ui/Card.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return { Card: (props: object) => createElement("mock-card", props) };
});
// The native sheet stands in as a plain element that exists only while presented.
jest.mock("~/ui/Sheet.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return {
    Sheet: (props: { visible: boolean; children: unknown; testID?: string }) =>
      props.visible ? createElement("mock-sheet", props) : null,
  };
});
jest.mock("~/ui/Button.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return {
    Button: (props: { label: string; testID?: string; onPress: () => void }) =>
      createElement("mock-button", props),
  };
});

const SLUG = "greet-and-introduce";
const KEY = `${SLUG}:en`;

const unit = {
  unit: { slug: SLUG, skills: [] },
  lexemes: {},
  sentences: {},
  audioAssets: {},
  clickAudio: {},
} as unknown as UnitResponse;

let mounted: ReactTestRenderer | null = null;

async function render(): Promise<ReactTestRenderer> {
  await act(async () => {
    mounted = create(
      <UnitDownload unit={unit} lang="en">
        <Text>crown line</Text>
      </UnitDownload>,
    );
  });
  return mounted!;
}

/** The pill: the one pressable button that carries the id (the host view under it has no onPress). */
const pill = (r: ReactTestRenderer, id: string): ReactTestInstance[] =>
  r.root.findAll(
    (n) =>
      n.props.testID === id &&
      n.props.accessibilityRole === "button" &&
      typeof n.props.onPress === "function",
  );

const button = (r: ReactTestRenderer, id: string) =>
  r.root.findAll((n) => n.type === "mock-button" && n.props.testID === id);

const sheets = (r: ReactTestRenderer) => r.root.findAll((n) => n.type === "mock-sheet");

async function press(node: ReactTestInstance | undefined) {
  expect(node).toBeDefined();
  await act(async () => node!.props.onPress());
}

afterEach(async () => {
  await act(async () => mounted?.unmount());
  mounted = null;
  mockPush.mockReset();
  mockStart.mockReset();
  mockCancel.mockReset();
  mockDelete.mockReset();
  mockLight.mockClear();
  mockPlan = "free";
  mockNative = true;
  mockReady = new Map();
  mockActive = new Map();
  mockFailed = new Map();
});

describe("offlineStateOf", () => {
  const snap = (over: Partial<Parameters<typeof offlineStateOf>[0]> = {}) => ({
    ready: new Map(),
    active: new Map(),
    failed: new Map(),
    ...over,
  });

  it("asks for Plus only when there is nothing on the phone and nothing running", () => {
    expect(offlineStateOf(snap(), KEY, "free")).toEqual({ kind: "plus" });
    expect(offlineStateOf(snap(), KEY, "plus")).toEqual({ kind: "idle", failure: null });
  });

  it("keeps a unit on the phone, or arriving, whatever the plan", () => {
    const ready = snap({ ready: new Map([[KEY, { bytes: 2048 } as never]]) });
    expect(offlineStateOf(ready, KEY, "free")).toEqual({ kind: "ready", bytes: 2048 });
    const active = snap({ active: new Map([[KEY, { done: 1, total: 4, bytes: 10 }]]) });
    expect(offlineStateOf(active, KEY, "free")).toMatchObject({ kind: "active", percent: 25 });
  });

  it("says 0 % before the count is known, and carries the reason a download stopped", () => {
    const starting = snap({ active: new Map([[KEY, { done: 0, total: 0, bytes: 0 }]]) });
    expect(offlineStateOf(starting, KEY, "plus")).toMatchObject({ percent: 0 });
    const failed = snap({ failed: new Map([[KEY, "no_space" as const]]) });
    expect(offlineStateOf(failed, KEY, "plus")).toEqual({ kind: "idle", failure: "no_space" });
  });
});

describe("UnitDownload", () => {
  it("is one line: the header's own words, then the pill, and no detail until asked", async () => {
    mockPlan = "plus";
    const r = await render();
    expect(
      r.root.findAll((n) => n.type === Text && n.props.children === "crown line"),
    ).toHaveLength(1);
    expect(pill(r, `download-open-${SLUG}`)).toHaveLength(1);
    expect(sheets(r)).toHaveLength(0);
    expect(button(r, `download-start-${SLUG}`)).toHaveLength(0);
    expect(r.root.findAll((n) => n.type === "mock-card")).toHaveLength(0);
  });

  it("sends a free learner to Plus instead of offering a download", async () => {
    const r = await render();
    expect(pill(r, `download-open-${SLUG}`)).toHaveLength(0);
    const plus = pill(r, `download-plus-${SLUG}`);
    expect(plus).toHaveLength(1);
    expect(plus[0]!.props.accessibilityLabel).toBe("units.download.pillPlusLabel");
    expect(plus[0]!.props.accessibilityHint).toBe("units.download.plusOnly");
    await press(plus[0]);
    expect(mockPush).toHaveBeenCalledWith("/plus");
    expect(mockLight).toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
    expect(sheets(r)).toHaveLength(0);
  });

  it("opens the sheet with the size for a Plus learner, and starts from there", async () => {
    mockPlan = "plus";
    const r = await render();
    await press(pill(r, `download-open-${SLUG}`)[0]);
    expect(sheets(r)).toHaveLength(1);
    expect(sheets(r)[0]!.props.testID).toBe(`download-sheet-${SLUG}`);
    expect(
      r.root.findAll((n) => n.type === Text && n.props.children === "units.download.size").length,
    ).toBe(1);
    const start = button(r, `download-start-${SLUG}`);
    expect(start).toHaveLength(1);
    expect(start[0]!.props.label).toBe("units.download.start");
    await press(start[0]);
    expect(mockStart).toHaveBeenCalledWith(SLUG, "en");
  });

  it("closes the sheet from its own button, for anyone who cannot swipe", async () => {
    mockPlan = "plus";
    const r = await render();
    await press(pill(r, `download-open-${SLUG}`)[0]);
    await press(button(r, `download-close-${SLUG}`)[0]);
    expect(sheets(r)).toHaveLength(0);
  });

  it("says a failed download failed, and offers the retry with the reason", async () => {
    mockPlan = "plus";
    mockFailed = new Map([[KEY, "offline"]]);
    const r = await render();
    const open = pill(r, `download-open-${SLUG}`);
    expect(open[0]!.props.accessibilityLabel).toBe("units.download.failedShort");
    await press(open[0]);
    expect(
      r.root.findAll((n) => n.type === Text && n.props.children === "units.download.errorOffline")
        .length,
    ).toBe(1);
    const retry = button(r, `download-start-${SLUG}`);
    expect(retry[0]!.props.label).toBe("common.retry");
  });

  it("shows the progress in the pill and lets a running download be cancelled on the free plan", async () => {
    mockActive = new Map([[KEY, { done: 1, total: 4, bytes: 512 }]]);
    const r = await render();
    expect(pill(r, `download-plus-${SLUG}`)).toHaveLength(0);
    const running = pill(r, `download-progress-${SLUG}`);
    expect(running).toHaveLength(1);
    expect(running[0]!.props.accessibilityValue).toEqual({ text: "units.download.progress" });
    await press(running[0]);
    const bar = r.root.findAll(
      (n) => n.props.accessibilityRole === "progressbar" && n.props.accessibilityValue,
    );
    expect(bar[0]!.props.accessibilityValue).toMatchObject({ now: 25 });
    await press(button(r, `download-cancel-${SLUG}`)[0]);
    expect(mockCancel).toHaveBeenCalledWith(SLUG, "en");
  });

  it("keeps a unit already on the phone removable on the free plan, and closes after removing", async () => {
    mockReady = new Map([[KEY, { bytes: 1024 }]]);
    const r = await render();
    expect(pill(r, `download-plus-${SLUG}`)).toHaveLength(0);
    const ready = pill(r, `download-ready-${SLUG}`);
    expect(ready).toHaveLength(1);
    expect(ready[0]!.props.accessibilityLabel).toBe("units.download.ready");
    await press(ready[0]);
    const remove = button(r, `download-remove-${SLUG}`);
    expect(remove).toHaveLength(1);
    await press(remove[0]);
    expect(mockDelete).toHaveBeenCalledWith(SLUG, "en");
    expect(sheets(r)).toHaveLength(0);
  });

  it("expands inline instead where the native sheet is not linked", async () => {
    mockPlan = "plus";
    mockNative = false;
    const r = await render();
    expect(r.root.findAll((n) => n.type === "mock-card")).toHaveLength(0);
    await press(pill(r, `download-open-${SLUG}`)[0]);
    expect(sheets(r)).toHaveLength(0);
    expect(r.root.findAll((n) => n.type === "mock-card")).toHaveLength(1);
    expect(button(r, `download-start-${SLUG}`)).toHaveLength(1);
  });
});

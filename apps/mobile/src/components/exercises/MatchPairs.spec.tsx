import type { ExercisePayload } from "@molo/core";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { MatchPairs } from "./MatchPairs.tsx";
import type { Content } from "./types.ts";

// Stand-ins for everything native: what is under test is which tap plays.
jest.mock("~/lib/i18n.tsx", () => ({ useT: () => (key: string) => key }));
jest.mock("~/ui/sfx.tsx", () => ({ useSfx: () => ({ play: () => undefined }) }));
jest.mock("~/dev/knobs.tsx", () => ({ currentTuning: () => ({ xp: { correct: 10 } }) }));
jest.mock("./CheckBar.tsx", () => ({ CheckBar: () => null }));
jest.mock("~/ui/OptionTile.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return { OptionTile: (props: object) => createElement("mock-tile", props) };
});
const mockPlay = jest.fn();
jest.mock("~/components/AudioButton.tsx", () => {
  const { createElement, useImperativeHandle, useRef } = jest.requireActual("react");
  return {
    AudioButton: (props: { url: string; controlRef?: unknown }) => {
      useImperativeHandle(props.controlRef, () => ({ play: () => mockPlay(props.url) }));
      return createElement("mock-audio", { url: props.url });
    },
    useAudioControls: () => {
      const controls = useRef(new Map());
      const controlFor = (id: string) => (control: unknown) => {
        if (control) controls.current.set(id, control);
        else controls.current.delete(id);
      };
      return { controls, controlFor };
    },
  };
});

const A = "00000000-0000-4000-8000-00000000aaaa";
const B = "00000000-0000-4000-8000-00000000bbbb";

function lexeme(id: string, lemma: string, gloss: string, url: string | null) {
  return {
    id,
    lemma,
    pos: "noun",
    nounClass: null,
    isPlural: false,
    infinitive: null,
    register: "standard" as const,
    gloss: { gloss, usageNote: null, contrastiveNote: null },
    audio: url
      ? { id: `${id}-audio`, url, tier: "1_native_studio" as const, durationMs: 500 }
      : null,
    voices: [],
  };
}

const content = {
  sourceLang: "en",
  lexemes: {
    [A]: lexeme(A, "zz-alpha", "fixture alpha", "https://audio.test/a.opus"),
    [B]: lexeme(B, "zz-beta", "fixture beta", null),
  },
  sentences: {},
  audioAssets: {},
} as unknown as Content;

const payload: Extract<ExercisePayload, { type: "match_pairs" }> = {
  type: "match_pairs",
  pairs: [{ lexemeId: A }, { lexemeId: B }],
};

async function render(quiet: boolean): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <MatchPairs payload={payload} content={content} onDone={() => undefined} quiet={quiet} />,
    );
  });
  return tree;
}

const tile = (tree: ReactTestRenderer, label: string) =>
  tree.root.find((n) => n.type === "mock-tile" && n.props.accessibilityLabel === label);

describe("tapping a match-pairs tile", () => {
  beforeEach(() => mockPlay.mockClear());

  it("plays the isiXhosa word once per tap, and chooses it", async () => {
    const tree = await render(false);
    await act(async () => tile(tree, "zz-alpha").props.onPress());
    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledWith("https://audio.test/a.opus");
    expect(tile(tree, "zz-alpha").props.selected).toBe(true);
    await act(async () => tile(tree, "zz-alpha").props.onPress());
    expect(mockPlay).toHaveBeenCalledTimes(2);
  });

  it("never plays a meaning", async () => {
    const tree = await render(false);
    await act(async () => tile(tree, "zz-alpha").props.onPress());
    mockPlay.mockClear();
    await act(async () => tile(tree, "fixture alpha").props.onPress());
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it("plays nothing in quiet mode, and nothing for a word with no recording", async () => {
    const quiet = await render(true);
    await act(async () => tile(quiet, "zz-alpha").props.onPress());
    expect(mockPlay).not.toHaveBeenCalled();
    const loud = await render(false);
    await act(async () => tile(loud, "zz-beta").props.onPress());
    expect(mockPlay).not.toHaveBeenCalled();
    expect(tile(loud, "zz-beta").props.selected).toBe(true);
  });

  it("keeps the speaker in the tile for a replay", async () => {
    const tree = await render(false);
    expect(tree.root.findAll((n) => n.type === "mock-audio")).toHaveLength(1);
  });
});

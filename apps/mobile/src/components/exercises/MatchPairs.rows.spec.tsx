import type { ExercisePayload } from "@molo/core";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { MatchPairs } from "./MatchPairs.tsx";
import type { Content } from "./types.ts";

// Stand-ins for everything native: what is under test is which meaning sits in which row.
jest.mock("~/lib/i18n.tsx", () => ({ useT: () => (key: string) => key }));
jest.mock("~/ui/sfx.tsx", () => ({ useSfx: () => ({ play: () => undefined }) }));
jest.mock("~/dev/knobs.tsx", () => ({ currentTuning: () => ({ xp: { correct: 10 } }) }));
jest.mock("./CheckBar.tsx", () => ({ CheckBar: () => null }));
jest.mock("~/ui/OptionTile.tsx", () => {
  const { createElement } = jest.requireActual("react");
  return { OptionTile: (props: object) => createElement("mock-tile", props) };
});
jest.mock("~/components/AudioButton.tsx", () => {
  const { useRef } = jest.requireActual("react");
  return {
    AudioButton: () => null,
    useAudioControls: () => ({ controls: useRef(new Map()), controlFor: () => () => undefined }),
  };
});

/** Placeholder words and meanings (not isiXhosa): `zz-<n>` means `meaning <n>`. */
function contentFor(ids: readonly string[]): Content {
  const lexemes = Object.fromEntries(
    ids.map((id, n) => [
      id,
      {
        id,
        lemma: `zz-${n}`,
        pos: "noun",
        nounClass: null,
        isPlural: false,
        infinitive: null,
        register: "standard",
        gloss: { gloss: `meaning ${n}`, usageNote: null, contrastiveNote: null },
        audio: null,
        voices: [],
      },
    ]),
  );
  return { sourceLang: "en", lexemes, sentences: {}, audioAssets: {} } as unknown as Content;
}

const idsFor = (set: number, n: number) =>
  Array.from(
    { length: n },
    (_, i) => `00000000-0000-4000-8000-${String(set * 10 + i).padStart(12, "0")}`,
  );

async function rowsOf(ids: readonly string[]): Promise<[string, string][]> {
  const payload: Extract<ExercisePayload, { type: "match_pairs" }> = {
    type: "match_pairs",
    pairs: ids.map((lexemeId) => ({ lexemeId })),
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <MatchPairs payload={payload} content={contentFor(ids)} onDone={() => undefined} />,
    );
  });
  // Tiles come in reading order: each row's word, then that row's meaning.
  const labels = tree.root
    .findAll((n) => n.type === "mock-tile")
    .map((n) => n.props.accessibilityLabel as string);
  await act(async () => tree.unmount());
  const rows: [string, string][] = [];
  for (let i = 0; i < labels.length; i += 2) rows.push([labels[i]!, labels[i + 1]!]);
  return rows;
}

const CASES = [2, 3, 4, 5, 6].flatMap((n) => [0, 1, 2, 3].map((set) => ({ n, set })));

describe("match_pairs rows", () => {
  it.each(CASES)(
    "never puts a meaning beside its own word ($n pairs, set $set)",
    async ({ n, set }) => {
      const rows = await rowsOf(idsFor(set, n));
      expect(rows).toHaveLength(n);
      for (const [word, meaning] of rows) {
        expect(meaning).not.toBe(word.replace("zz-", "meaning "));
      }
      // Every meaning is still there, once.
      expect(rows.map(([, m]) => m).sort()).toEqual(
        Array.from({ length: n }, (_, i) => `meaning ${i}`).sort(),
      );
    },
  );
});

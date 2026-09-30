import { describe, expect, it } from "vitest";

import {
  parseCorpus,
  sentenceText,
  sourceRefFor,
  teachableSentences,
  words,
} from "./spoken-xhosa-gu.ts";

/**
 * A fixture in the corpus's own shape, including the things that make it a
 * linguistic transcription rather than a textbook: a contraction, an
 * unfinished expression, a pause, a sentence with no translation and a
 * translation that is a continuation of the previous clause.
 */
const XML = `<?xml version='1.0' encoding='UTF-8'?>
<corpus id="xhosa">
  <text filename="REC001" _id="aa">
    <sentence id="s1" speaker="Z" translation="The child is eating meat.">
      <token normalized="Umntwana" segmented="um-ntwana" pos="N" sense="child">Umntwana</token>
      <token normalized="utya" segmented="u-ty-a" pos="V" sense="eat">u{ty}a</token>
      <token normalized="inyama" segmented="i-nyama" pos="N" sense="meat">inyama</token>
      <token normalized="." segmented="_" pos="PUNC">.</token>
    </sentence>
    <sentence id="s2" speaker="A" translation="I was going to the sh+">
      <token normalized="Ndaya" segmented="nda-y-a" pos="V" sense="go">Ndaya</token>
      <token normalized="e+" type="unfinished expression">e+</token>
      <token normalized="venkileni" segmented="e-venkile-ini" pos="N" sense="shop">venkileni</token>
    </sentence>
    <sentence id="s3" speaker="Z">
      <token normalized="Ndiyahamba" segmented="ndi-ya-hamb-a" pos="V" sense="go">Ndiyahamba</token>
      <token normalized="ngoku" segmented="ngoku" pos="ADV" sense="now">ngoku</token>
      <token normalized="ekhaya" segmented="e-khaya" pos="N" sense="home">ekhaya</token>
    </sentence>
    <sentence id="s4" speaker="Z" translation="that travel on a rail, like a train.">
      <token normalized="ezihamba" segmented="ezi-hamb-a" pos="V" sense="travel">ezihamba</token>
      <token normalized="esipolweni" segmented="e-sipolo-ini" pos="N" sense="rail">esipolweni</token>
      <token normalized="oku" segmented="oku" sense="as though">oku</token>
    </sentence>
    <sentence id="s5" speaker="A" translation="Yes.">
      <token normalized="Ewe" segmented="ewe" pos="INTJ" sense="yes">Ewe</token>
    </sentence>
    <sentence id="s6" speaker="A" translation="The people are many here.">
      <token normalized="Abantu" segmented="aba-ntu" pos="N" sense="people">Abantu</token>
      <token normalized="baninzi" segmented="ba-ninzi" pos="ADJ" sense="many">baninzi</token>
      <token normalized="apha" segmented="apha" pos="ADV" sense="here">apha</token>
      <token normalized="." segmented="_" pos="PUNC">.</token>
    </sentence>
  </text>
</corpus>
`;

const corpus = parseCorpus(XML);

describe("parsing the corpus", () => {
  it("finds every sentence and keeps it with its recording", () => {
    expect(corpus).toHaveLength(6);
    expect(corpus.every((s) => s.file === "REC001")).toBe(true);
  });

  it("reads the annotations we depend on", () => {
    const s = corpus[0];
    expect(s?.translation).toBe("The child is eating meat.");
    expect(s?.speaker).toBe("Z");
    expect(s?.tokens[0]).toEqual({
      normalized: "Umntwana",
      segmented: ["um", "ntwana"],
      pos: "N",
      sense: "child",
      marker: null,
    });
  });

  it("keeps the transcription marker that disqualifies a sentence", () => {
    expect(corpus[1]?.tokens[1]?.marker).toBe("unfinished expression");
  });

  it("does not treat punctuation as a word", () => {
    expect(words(corpus[0] as never)).toHaveLength(3);
  });

  it("reconstructs the sentence from the corpus's normalised forms", () => {
    // Never from the element text, which carries the transcriber's braces.
    expect(sentenceText(corpus[0] as never)).toBe("Umntwana utya inyama.");
  });

  it("points a source_ref back at the exact sentence", () => {
    expect(sourceRefFor(corpus[0] as never)).toBe("xhosa.xml:text=REC001;sentence=s1");
  });
});

describe("the teachable subset", () => {
  const result = teachableSentences(corpus, { minWords: 3, maxWords: 12 });

  it("keeps only what a learner could be shown", () => {
    expect(result.accepted.map((s) => s.id)).toEqual(["s1", "s6"]);
  });

  it("says why each of the others went", () => {
    expect(result.rejected).toEqual({
      no_translation: 1, // s3
      disfluency_or_marker: 1, // s2, unfinished expression
      marker_in_token: 0,
      length: 1, // s5, one word
      no_predicate: 0,
      not_sentence_initial: 1, // s4, a continuation
      translation_not_a_sentence: 0,
    });
  });

  it("counts everything it looked at", () => {
    expect(result.considered).toBe(6);
  });
});

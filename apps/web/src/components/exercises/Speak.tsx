import { type ExercisePayload } from "@molo/core";
import { Mic, Square } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { AudioButton } from "~/components/AudioButton.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { currentTuning } from "~/dev/knobs.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";
import { useRecorder } from "~/lib/recorder.ts";
import { useSfx } from "~/lib/sfx.tsx";

import { ClickText } from "./ClickText.tsx";
import { SpeechBubble } from "./SpeechBubble.tsx";
import type { ExerciseProps } from "./types.ts";
import { useDecodedAudio, Waveform } from "./Waveform.tsx";
import { WordHint, glossForHint } from "./WordHint.tsx";

/** Nothing to hide: the prompt is the thing to say, not the thing to guess. */
const NO_HIDDEN_WORDS: ReadonlySet<string> = new Set();

type P = Extract<ExercisePayload, { type: "speak" }>;

/**
 * Say it: hear the speaker, record a take, compare the two waveforms, and
 * judge yourself honestly. There is no speech recognition here on purpose:
 * for a click language a tick-box from a machine would teach the wrong
 * thing. XP only on the honest "sounded right". Without a microphone the
 * exercise is skipped without penalty.
 */
export function Speak({ payload, content, onDone }: ExerciseProps<P>) {
  const t = useT();
  const sfx = useSfx();
  const { reduced } = useMotionPrefs();
  const text =
    "lexemeId" in payload.prompt
      ? (content.lexemes[payload.prompt.lexemeId]?.lemma ?? "?")
      : (content.sentences[payload.prompt.sentenceId]?.textXh ?? "?");
  const gloss =
    "lexemeId" in payload.prompt
      ? content.lexemes[payload.prompt.lexemeId]?.gloss?.gloss
      : content.sentences[payload.prompt.sentenceId]?.gloss?.gloss;
  // Sentence prompts get the mascot and the word hints; a single word keeps
  // the big, plain layout it already had.
  const sentenceTokens =
    "sentenceId" in payload.prompt
      ? (content.sentences[payload.prompt.sentenceId]?.tokens ?? null)
      : null;
  const reference =
    content.audioAssets[payload.referenceAudioAssetId] ??
    ("lexemeId" in payload.prompt
      ? content.lexemes[payload.prompt.lexemeId]?.audio
      : content.sentences[payload.prompt.sentenceId]?.audio);
  const rec = useRecorder();
  const refBuffer = useDecodedAudio(reference?.url ?? null);
  const takeBuffer = useDecodedAudio(rec.take?.blob ?? null);
  const [refProgress, setRefProgress] = useState(0);
  const [takeProgress, setTakeProgress] = useState(0);
  const takeAudio = useRef<HTMLAudioElement | null>(null);
  const refAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (rec.take) sfx.play("tap");
  }, [rec.take, sfx]);

  if (rec.unsupported || rec.denied) {
    return (
      <div className="text-center">
        <h2 className="mb-2 font-display text-2xl font-bold text-indigo">
          {t("lesson.speakTitle")}
        </h2>
        <p className="mb-6 text-mist">{t("lesson.noMic")}</p>
        {/* No microphone is not the learner's fault: neutral, no XP. */}
        <Button variant="indigo" onClick={() => onDone({ correct: true, xp: 0 })}>
          {t("lesson.continue")}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 font-display text-2xl font-bold text-indigo">{t("lesson.speakTitle")}</h2>
      <p className="mb-4 text-sm text-mist">{t("lesson.recordHint")}</p>
      {/* A sentence is said by somebody: the penguin is the learner, waiting
          to hear it back. Every word of it can be tapped for its meaning —
          nothing is hidden here, because the prompt is not the answer. */}
      {sentenceTokens ? (
        <SpeechBubble speaker="producing">
          <p
            className="flex flex-wrap items-baseline gap-x-2 gap-y-2 font-display text-2xl font-bold text-ink sm:text-3xl"
            lang="xh"
          >
            {sentenceTokens.map((k) => (
              <WordHint
                key={k.position}
                word={k.surfaceForm}
                gloss={glossForHint(content, k.lexemeId, NO_HIDDEN_WORDS)}
              />
            ))}
          </p>
          {gloss && <p className="mt-2 text-base text-mist">{gloss}</p>}
        </SpeechBubble>
      ) : (
        <div className="mb-6 rounded-3xl bg-sand p-5 text-center">
          <p className="font-display text-4xl font-bold text-ink sm:text-5xl">
            <ClickText text={text} />
          </p>
          {gloss && <p className="mt-1 text-lg text-mist">{gloss}</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border-2 border-mist-soft bg-cloud p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-mist">
            {t("lesson.reference")}
          </h3>
          <Waveform buffer={refBuffer} progress={refProgress} tone="indigo" />
          <div className="mt-3 flex items-center gap-3">
            <AudioButton
              url={reference?.url}
              label={t("lesson.listen")}
              attribution={reference?.attribution}
              tone="indigo"
              autoPlay
            />
            <AudioButton
              url={reference?.url}
              label={t("lesson.slow")}
              rate={0.7}
              size="sm"
              tone="indigo"
            />
            {reference?.url && (
              <audio
                ref={refAudio}
                src={reference.url}
                className="hidden"
                onTimeUpdate={(e) => {
                  const a = e.currentTarget;
                  setRefProgress(a.duration ? a.currentTime / a.duration : 0);
                }}
              />
            )}
          </div>
        </div>
        <div
          className={`rounded-2xl border-2 p-4 ${rec.state === "recording" ? "border-coral bg-coral-soft/40" : "border-mist-soft bg-cloud"}`}
        >
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-mist">
            {t("lesson.yourTake")}
          </h3>
          {rec.state === "recording" ? (
            <div className="flex h-14 items-end justify-center gap-1" aria-hidden>
              {Array.from({ length: 24 }, (_, i) => (
                <motion.span
                  key={i}
                  className="w-2 rounded-full bg-coral"
                  animate={{
                    height: reduced
                      ? 12
                      : Math.max(6, rec.level * 56 * (0.5 + Math.abs(Math.sin(i * 1.3)) * 0.8)),
                  }}
                  transition={{ duration: 0.08 }}
                />
              ))}
            </div>
          ) : (
            <Waveform buffer={takeBuffer} progress={takeProgress} tone="sea" />
          )}
          {/* The level meter is a picture; the state is announced in words. */}
          <p className="sr-only" role="status" aria-live="polite">
            {rec.state === "recording" ? t("lesson.speak.recording") : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {rec.state !== "recording" ? (
              <button
                type="button"
                onClick={() => void rec.start()}
                className="pressable inline-flex h-14 w-14 items-center justify-center rounded-full border-coral-deep bg-coral text-white shadow-card"
                aria-label={rec.take ? t("edit.recorder.retake") : t("edit.recorder.record")}
              >
                <Mic size={26} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={rec.stop}
                className="pressable inline-flex h-14 w-14 items-center justify-center rounded-full border-indigo-deep bg-indigo text-white shadow-card"
                aria-label={t("edit.recorder.stop")}
              >
                <Square size={22} fill="currentColor" aria-hidden />
              </button>
            )}
            {rec.take && (
              <>
                <AudioButton
                  key={rec.take.url}
                  url={rec.take.url}
                  label={t("lesson.yourTake")}
                  tone="sea"
                  autoPlay
                />
                <audio
                  ref={takeAudio}
                  src={rec.take.url}
                  className="hidden"
                  onTimeUpdate={(e) => {
                    const a = e.currentTarget;
                    setTakeProgress(
                      a.duration && Number.isFinite(a.duration) ? a.currentTime / a.duration : 0,
                    );
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-end gap-3 rounded-3xl bg-sand-deep p-4">
        <Button variant="ghost" onClick={() => onDone({ correct: false, xp: 0 })}>
          {t("lesson.skip")}
        </Button>
        {rec.take && (
          <>
            <Button variant="outline" onClick={rec.reset}>
              {t("lesson.tryAgain")}
            </Button>
            <Button
              variant="sea"
              size="lg"
              onClick={() => onDone({ correct: true, xp: currentTuning().xp.correct })}
            >
              {t("lesson.soundedRight")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

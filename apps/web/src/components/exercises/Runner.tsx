import {
  NO_HEARTS_LOST,
  applyModes,
  celebrationBeats,
  correctionNoteFor,
  decodeExercisePayload,
  heartsRunOut,
  lessonHeartsView,
  mistakeLexemeId,
  mustConfirmExit,
  newWordIntroductions,
  nextRun,
  pickGrammarNote,
  tallyHeartAnswered,
  tallyHeartLost,
  wordsToMeet,
  type CelebrationExtras,
  type ExerciseMoment,
  type ExercisePayload,
  type GrammarNoteView,
  type HeartsTally,
  type MistakeEntry,
} from "@molo/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { Either } from "effect";
import { Volume2, VolumeX, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Celebration } from "~/components/celebration/Celebration.tsx";
import { GrammarNote } from "~/components/grammar/GrammarNote.tsx";
import { CurrentPattern } from "~/components/grammar/PatternCorrection.tsx";
import { OutOfHearts } from "~/components/OutOfHearts.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { XpChip } from "~/components/ui/XpChip.tsx";
import { useTuning } from "~/dev/knobs.tsx";
import { markNoteSeen, readSeenNotes } from "~/lib/grammar-seen.ts";
import { useHearts } from "~/lib/hearts.tsx";
import { useT } from "~/lib/i18n.tsx";
import { useModes } from "~/lib/modes.tsx";
import { useMotionPrefs } from "~/lib/motion.ts";

import { ClassSort } from "./ClassSort.tsx";
import { ClickDrill } from "./ClickDrill.tsx";
import { ClickIdentify } from "./ClickIdentify.tsx";
import { ConcordFill } from "./ConcordFill.tsx";
import { CultureCard } from "./CultureCard.tsx";
import { LessonLeaveGuard } from "./LeaveLesson.tsx";
import { LessonHearts } from "./LessonHearts.tsx";
import { LessonProgressBar, RunCounter } from "./LessonProgress.tsx";
import { ListenSelect } from "./ListenSelect.tsx";
import { MatchPairs } from "./MatchPairs.tsx";
import { MomentBadge } from "./MomentBadge.tsx";
import { NewWords } from "./NewWords.tsx";
import { CurrentExercise } from "./ReportAction.tsx";
import { SelectListen } from "./SelectListen.tsx";
import { Speak } from "./Speak.tsx";
import { TranslateTap } from "./TranslateTap.tsx";
import { TranslateType } from "./TranslateType.tsx";
import type { Content } from "./types.ts";

export interface RunnableExercise {
  id: string;
  type: string;
  payload: unknown;
  /**
   * "new word" or "tricky" — from the lesson payload for a signed-in
   * learner, derived on the device for a guest. Undefined means the caller
   * has nothing to say about it, which is not the same as "ordinary".
   */
  moment?: ExerciseMoment | null | undefined;
  /** The lexemes it teaches (`ExerciseView.teaches`): what a new-word card can introduce. */
  teaches?: readonly string[] | undefined;
}

export function Exercise({
  payload,
  content,
  onDone,
  quiet,
}: {
  payload: ExercisePayload;
  content: Content;
  onDone: (r: { correct: boolean; xp: number }) => void;
  quiet: boolean;
}) {
  switch (payload.type) {
    case "listen_select":
      return <ListenSelect payload={payload} content={content} onDone={onDone} quiet={quiet} />;
    case "select_listen":
      return <SelectListen payload={payload} content={content} onDone={onDone} quiet={quiet} />;
    case "match_pairs":
      return <MatchPairs payload={payload} content={content} onDone={onDone} quiet={quiet} />;
    case "class_sort":
      return <ClassSort payload={payload} content={content} onDone={onDone} />;
    case "translate_tap":
      return <TranslateTap payload={payload} content={content} onDone={onDone} />;
    case "translate_type":
      return <TranslateType payload={payload} content={content} onDone={onDone} />;
    case "concord_fill":
      return <ConcordFill payload={payload} content={content} onDone={onDone} />;
    case "speak":
      return <Speak payload={payload} content={content} onDone={onDone} />;
    case "click_drill":
      return <ClickDrill payload={payload} content={content} onDone={onDone} />;
    case "culture_card":
      return <CultureCard payload={payload} content={content} onDone={onDone} />;
    case "click_identify":
      return <ClickIdentify payload={payload} content={content} onDone={onDone} />;
    default:
      return <Unsupported onDone={onDone} />;
  }
}

function Unsupported({ onDone }: { onDone: (r: { correct: boolean; xp: number }) => void }) {
  const t = useT();
  return (
    <div className="text-center">
      <p className="mb-4 text-mist">{t("common.error")}</p>
      <Button variant="indigo" onClick={() => onDone({ correct: false, xp: 0 })}>
        {t("lesson.skip")}
      </Button>
    </div>
  );
}

/**
 * Runs a lesson's exercises in order with the celebration moments from
 * DESIGN.md: a sun-coloured progress strip, a running XP chip, and — once
 * the last exercise is answered — the celebration sequence.
 *
 * The lesson is reported to the caller (`onFinish`) the instant the last
 * exercise is answered rather than on a button, so the server's answer is
 * usually in hand by the time the first beat asks for the next tap. The
 * beats that depend on it arrive through `extras`; until then the sequence
 * is the lesson beat alone, which is exactly what a guest ever sees.
 *
 * A word the learner has never met is met first, on a card in front of the
 * first exercise that asks for its meaning (`newWordIntroductions`). The
 * header carries the hearts on the right, and a lost one breaks there the
 * moment the wrong answer is continued past. None left pauses the lesson in
 * place, header and all. Once an exercise is done, leaving asks first
 * (`LessonLeaveGuard`), for a lesson that has a way out (`exitTo`).
 */
export function LessonRunner({
  exercises,
  content,
  exitTo,
  heading,
  onFinish,
  onLeave,
  extras,
  grammarNotes,
  newWords,
}: {
  exercises: readonly RunnableExercise[];
  content: Content;
  /** The way out. A lesson with one asks before leaving halfway; the developer playground has none. */
  exitTo?: { to: "/learn/$slug"; params: { slug: string } } | undefined;
  /**
   * The words this learner has never met (`newWordsFor`: the server's list
   * for an account, the device's for a guest). Each is met on a card before
   * the first exercise that asks for it. Absent: no cards.
   */
  newWords?: ReadonlySet<string> | undefined;
  /** The page's h1. Visually the strip and the exercise carry it; a screen reader needs the words. */
  heading?: string | undefined;
  /** Fires once, as soon as the last exercise is answered. */
  onFinish: (summary: {
    xp: number;
    correct: number;
    total: number;
    /** Words missed, for "practise mistakes"; only exercises with one clear subject report one. */
    mistakes: readonly MistakeEntry[];
  }) => void;
  /** The celebration sequence is over: back to the path. */
  onLeave: () => void;
  /** Streak, words learned and unit completion, once the caller knows them. */
  extras?: CelebrationExtras | null | undefined;
  /**
   * The published rules this lesson's skill teaches (docs/GRAMMAR.md). The
   * first the learner has not dismissed stands in front of the drill; after
   * a wrong answer the check bar names it. Empty for a skill that teaches
   * no rule, and the lesson then opens straight into the exercise.
   */
  grammarNotes?: readonly GrammarNoteView[] | undefined;
}) {
  const t = useT();
  const { reduced } = useMotionPrefs();
  // The lesson's own numbers: the developer gallery's knobs move what this
  // screen shows, never what the server awarded (`~/dev/knobs.ts`).
  const tuning = useTuning();
  const [index, setIndex] = useState(0);
  // Which rules this learner has already been shown and dismissed. Read once
  // on mount so the note does not flicker back in mid-lesson, and extended
  // in place when one is dismissed.
  const [seenNotes, setSeenNotes] = useState<readonly string[]>(readSeenNotes);
  const [xp, setXp] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [mistakes, setMistakes] = useState<MistakeEntry[]>([]);
  const [lastDelta, setLastDelta] = useState<{ key: number; xp: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const { modes, set: setModes } = useModes();
  const hearts = useHearts();
  const navigate = useNavigate();
  // Hearts this lesson has cost, counted here so the header breaks one at
  // once; the server's count stays the ceiling (`lessonHeartsView`).
  const [tally, setTally] = useState<HeartsTally>(NO_HEARTS_LOST);
  // The words already met on a card in this lesson: never shown twice, even
  // when a fresher payload or a mode switch moves the plan under the learner.
  const [introduced, setIntroduced] = useState<ReadonlySet<string>>(() => new Set());
  // The step whose container last took focus, so a re-render never pulls
  // focus back off an answer the learner has tabbed to.
  const focusedStep = useRef<string | null>(null);
  // Invalid payloads never reach a learner (the publish gate), so drop them here too.
  const [run, setRun] = useState(0);
  const valid = exercises.flatMap((e) => {
    const r = decodeExercisePayload(e.payload);
    return Either.isRight(r)
      ? [
          {
            exercise: {
              id: e.id,
              payload: r.right,
              moment: e.moment ?? null,
              teaches: e.teaches ?? [],
            },
            payload: r.right,
          },
        ]
      : [];
  });
  const { kept: list, skipped } = applyModes(valid, modes);
  const total = list.length;
  const current = list[index];
  const done = !current;
  const finished = done && total > 0;
  const perfect = done && correct === total && total > 0;
  // Planned over the lesson as it actually runs under the modes, so a word
  // whose first exercise was dropped is met before the next one instead.
  const plan = newWordIntroductions({
    exercises: list.map((k) => ({
      id: k.exercise.id,
      type: k.exercise.payload.type,
      teaches: k.exercise.teaches,
    })),
    isNew: (id) => newWords?.has(id) ?? false,
    canShow: (id) => content.lexemes[id] !== undefined,
  });
  const heartsView = lessonHeartsView(hearts.state, tally);
  // Out of hearts: the server says none, or this lesson's own losses do and
  // the server has not caught up yet. Either way the next exercise must not
  // flash up first.
  const paused = heartsRunOut(heartsView);
  const xpTotal = xp + (perfect ? tuning.xp.perfectLessonBonus : 0);
  // The report goes out once, the moment the lesson ends; the sequence then
  // has the whole first beat to wait for the answer.
  const reported = useRef(false);
  const report = useRef(onFinish);
  report.current = onFinish;
  useEffect(() => {
    // A lesson with nothing left in the learner's modes was never run, so it
    // is never reported and never celebrated.
    if (!done || total === 0 || reported.current) return;
    reported.current = true;
    report.current({ xp: xpTotal, correct, total, mistakes });
  }, [done, xpTotal, correct, total, mistakes]);

  if (total === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl bg-cloud p-8 text-center shadow-card">
        <VolumeX className="mx-auto mb-3 text-mist" size={36} aria-hidden />
        <p className="mb-6 text-ink">{t("lesson.nothingInModes")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {!modes.listening && (
            <Button variant="indigo" onClick={() => void setModes({ listening: true })}>
              {t("lesson.turnOnListening")}
            </Button>
          )}
          <Link to="/settings" className="self-center text-sm font-semibold text-indigo underline">
            {t("settings.title")}
          </Link>
        </div>
      </div>
    );
  }

  // The header, the same in the lesson and in its pause: the way out, the
  // bar, quiet mode, the XP and, on the right, the hearts.
  const header = (
    <div className="mb-6 flex items-center gap-2 sm:gap-3">
      {exitTo && (
        <Link
          to={exitTo.to}
          params={exitTo.params}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cloud text-mist shadow-card hover:text-indigo"
          aria-label={t("lesson.exit")}
        >
          <X size={20} aria-hidden />
        </Link>
      )}
      <LessonProgressBar index={index} total={total} run={run} />
      <button
        type="button"
        onClick={() => void setModes({ listening: !modes.listening })}
        aria-pressed={!modes.listening}
        aria-label={t("lesson.quietToggle")}
        title={t("lesson.quietToggle")}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-card ${modes.listening ? "bg-cloud text-mist hover:text-indigo" : "bg-indigo text-sun"}`}
      >
        {modes.listening ? <Volume2 size={18} aria-hidden /> : <VolumeX size={18} aria-hidden />}
      </button>
      <span className="relative shrink-0">
        <XpChip value={xp} size="sm" duration={0.5} />
        <AnimatePresence>
          {lastDelta && (
            <motion.span
              key={lastDelta.key}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 1, 1, 0], y: reduced ? 0 : -28 }}
              transition={{ duration: 1 }}
              className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 font-display text-sm font-bold text-sea-deep"
            >
              +{lastDelta.xp}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <LessonHearts view={heartsView} />
    </div>
  );
  // XP and hearts change silently on screen; this says them once, politely.
  const live = (
    <p className="sr-only" role="status" aria-live="polite">
      {announcement}
    </p>
  );

  // Out of hearts: the lesson pauses in place, under the header where the
  // last heart has just broken (the same header, so its animation plays
  // on). Practice or Plus reopens it; leaving is the lesson's own way out,
  // so it does not ask. Before the rule, too: a learner with no hearts left
  // is not asked to read one first.
  const pause = paused && hearts.state && !finished ? hearts.state : null;

  // The rule that stands in front of the drill, and the one a wrong answer
  // is named after. `atStart` is what keeps a note from interrupting: it can
  // only appear on the lesson's first exercise, never between two of them.
  const notes = grammarNotes ?? [];
  const pending = pickGrammarNote({ notes, seen: seenNotes, atStart: index === 0 && !done });
  const pattern = correctionNoteFor(notes, pending?.id ?? null);
  const dismiss = (id: string) => setSeenNotes(markNoteSeen(id));

  if (pending && !pause) {
    return (
      <div>
        {heading && <h1 className="sr-only">{heading}</h1>}
        {/* The way out stays on screen: a learner who opened a lesson by
            mistake must not have to read a rule to leave it. */}
        {exitTo && (
          <div className="mb-6">
            <Link
              to={exitTo.to}
              params={exitTo.params}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-cloud text-mist shadow-card hover:text-indigo"
              aria-label={t("lesson.exit")}
            >
              <X size={20} aria-hidden />
            </Link>
          </div>
        )}
        <GrammarNote
          note={pending}
          audio={content.audioAssets}
          onContinue={() => dismiss(pending.id)}
          onSkip={() => dismiss(pending.id)}
        />
      </div>
    );
  }

  if (done) {
    return (
      <Celebration
        beats={celebrationBeats(
          { xp: xpTotal, correct, total, ...extras },
          { milestones: tuning.milestones },
        )}
        onDone={onLeave}
      />
    );
  }

  const onDone = (r: { correct: boolean; xp: number }) => {
    setXp((x) => x + r.xp);
    setRun((n) => nextRun(n, r.correct));
    if (r.correct) setCorrect((c) => c + 1);
    else {
      // The header breaks the heart now; the server's answer then becomes
      // the count it goes on from.
      setTally((n) => tallyHeartLost(n, hearts.state));
      void hearts
        .lose()
        .then((state) => {
          setTally((n) => tallyHeartAnswered(n, state));
          // The heart counter is a picture in the strip; say it in words too.
          if (state && !state.unlimited)
            setAnnouncement(t("hearts.lost", { hearts: state.hearts, max: state.max }));
          return state;
        })
        .catch(() => null);
      // File the word for "practise mistakes"; the server keeps only words
      // this lesson actually teaches.
      const lexemeId = mistakeLexemeId(current.exercise.payload);
      if (lexemeId)
        setMistakes((m) => [...m, { lexemeId, exerciseType: current.exercise.payload.type }]);
    }
    if (r.xp > 0) {
      setLastDelta({ key: Date.now(), xp: r.xp });
      setAnnouncement(t("lesson.xpEarned", { xp: r.xp }));
    }
    setIndex((i) => i + 1);
  };

  // New words first: a card in front of the exercise, unscored, and the bar
  // stays where it is until the exercise itself is answered.
  const meet = wordsToMeet(plan, current.exercise.id, introduced);
  const step = meet.length > 0 ? `meet-${current.exercise.id}` : current.exercise.id;
  // The first step of a lesson keeps focus where the page put it; every
  // later one (and the exercise straight after a card, whose Continue has
  // just gone) takes it.
  const takesFocus = index > 0 || introduced.size > 0;

  // One tree for the lesson and its pause, with the header in the same
  // place in both, so the heart that ran out finishes breaking above the
  // pause card instead of being remounted without its animation.
  return (
    <div>
      {/* In the pause the card's own heading is the h1, and it takes focus. */}
      {heading && !pause && <h1 className="sr-only">{heading}</h1>}
      {live}
      {exitTo && !pause && (
        <LessonLeaveGuard active={mustConfirmExit({ done: index, finished, paused })} />
      )}
      {header}
      {pause ? (
        <OutOfHearts
          state={{ ...pause, hearts: 0 }}
          {...(exitTo ? { onLeave: () => void navigate(exitTo) } : {})}
        />
      ) : (
        <>
          <RunCounter run={run} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              // Answering unmounts the check bar's Continue button, which drops
              // focus to the body and sends a keyboard user back to the top of
              // the page. The new step takes focus instead, once, so the next
              // Tab lands on its first control (WCAG 2.4.3) and a later
              // re-render never pulls focus back off an answer.
              ref={(el) => {
                if (!el || !takesFocus || focusedStep.current === step) return;
                focusedStep.current = step;
                el.focus({ preventScroll: true });
              }}
              tabIndex={-1}
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -40 }}
              transition={{ duration: reduced ? 0.1 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-3xl bg-cloud p-5 shadow-card sm:p-8"
            >
              {meet.length > 0 ? (
                <NewWords
                  words={meet}
                  content={content}
                  listening={modes.listening}
                  onContinue={() => setIntroduced((met) => new Set([...met, ...meet]))}
                />
              ) : (
                <>
                  <MomentBadge moment={current.exercise.moment} />
                  {/* The exercise's id, for "report this exercise" in the check
                      bar, and the skill's rule, for the correction that names
                      the pattern after a wrong answer. Both ride in context so
                      none of the ten exercise widgets has to know about either. */}
                  <CurrentExercise id={current.exercise.id}>
                    <CurrentPattern note={pattern}>
                      <Exercise
                        payload={current.exercise.payload}
                        content={content}
                        onDone={onDone}
                        quiet={current.quiet}
                      />
                    </CurrentPattern>
                  </CurrentExercise>
                  {skipped.listening + skipped.speaking > 0 && index === 0 && (
                    <p className="mt-4 text-center text-xs text-mist">
                      {t("lesson.skippedForModes", {
                        count: skipped.listening + skipped.speaking,
                      })}
                    </p>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

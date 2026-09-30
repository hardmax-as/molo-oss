import {
  NO_HEARTS_LOST,
  celebrationBeats,
  correctionNoteFor,
  decodeExercisePayload,
  heartsRunOut,
  lessonHeartsView,
  mistakeLexemeId,
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
import { Either } from "effect";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { GrammarNote } from "~/components/grammar/GrammarNote.tsx";
import { CurrentPattern } from "~/components/grammar/PatternCorrection.tsx";
import { OutOfHearts } from "~/components/OutOfHearts.tsx";
import { useTuning } from "~/dev/knobs.tsx";
import { markNoteSeen, readSeenNotes } from "~/lib/grammar-seen.ts";
import type { HeartsState } from "~/lib/hearts-format.ts";
import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Celebration } from "~/ui/celebration/Celebration.tsx";
import { useMotion } from "~/ui/motion.ts";

import { ClassSort } from "./ClassSort.tsx";
import { ClickDrill } from "./ClickDrill.tsx";
import { ClickIdentify } from "./ClickIdentify.tsx";
import { ConcordFill } from "./ConcordFill.tsx";
import { CultureCard } from "./CultureCard.tsx";
import { filterExercises, type ExerciseModes } from "./helpers.ts";
import { LessonStrip } from "./LessonStrip.tsx";
import { ListenSelect } from "./ListenSelect.tsx";
import { MatchPairs } from "./MatchPairs.tsx";
import { MomentBadge } from "./MomentBadge.tsx";
import { NewWords } from "./NewWords.tsx";
import { CurrentExercise } from "./ReportAction.tsx";
import { SelectListen } from "./SelectListen.tsx";
import { Speak } from "./Speak.tsx";
import { TranslateTap } from "./TranslateTap.tsx";
import { TranslateType } from "./TranslateType.tsx";
import { SKIPPED, type Content, type ExerciseResult } from "./types.ts";

export interface RunnableExercise {
  id: string;
  type: string;
  payload: unknown;
  /**
   * "new word" or "tricky" — from the lesson payload for a signed-in
   * learner, derived on the device for a guest (`~/lib/moment.ts`).
   */
  moment?: ExerciseMoment | null | undefined;
  /** The lexemes it teaches (`ExerciseView.teaches`): what a new-word card can introduce. */
  teaches?: readonly string[] | undefined;
}

type Done = (r: ExerciseResult) => void;

export interface LessonSummary {
  xp: number;
  correct: number;
  /** Answered exercises; skipped ones are not counted. */
  total: number;
  skipped: number;
  /** Words missed, for "practise mistakes"; only exercises with one clear subject report one. */
  mistakes: readonly MistakeEntry[];
}

export function Exercise({
  payload,
  content,
  onDone,
  quiet,
}: {
  payload: ExercisePayload;
  content: Content;
  onDone: Done;
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
    case "click_drill":
      return <ClickDrill payload={payload} content={content} onDone={onDone} />;
    case "speak":
      return <Speak payload={payload} content={content} onDone={onDone} />;
    case "culture_card":
      return <CultureCard payload={payload} content={content} onDone={onDone} />;
    case "click_identify":
      return <ClickIdentify payload={payload} content={content} onDone={onDone} />;
    default:
      return <Unsupported onDone={onDone} />;
  }
}

/** An exercise type this build cannot run: skipped, never scored. */
function Unsupported({ onDone }: { onDone: Done }) {
  const t = useT();
  return (
    <View className="items-start">
      <Button label={t("lesson.skip")} variant="cloud" onPress={() => onDone(SKIPPED)} />
    </View>
  );
}

/**
 * Runs a lesson in order under the learner's modes: listening off turns the
 * listening widgets into reading ones and drops click drills; speaking off
 * drops speak exercises. The client tallies XP for the chip; the server
 * recomputes it on completion. Skipped exercises (nothing to hear, no
 * microphone) cost no heart and stay out of the score.
 *
 * The lesson is reported (`onFinish`) the instant the last exercise is
 * answered rather than on a button, so the server's answer is usually in
 * hand by the time the celebration's first beat asks for the next tap; the
 * beats that depend on it arrive through `extras`.
 *
 * A word the learner has never met is met first, on a card in front of the
 * first exercise that asks for its meaning (`newWordIntroductions`). The
 * strip carries the hearts on the right, and a lost one breaks there the
 * moment the wrong answer is continued past. None left pauses the lesson in
 * place, under the strip, with every answer so far kept.
 */
export function LessonRunner({
  exercises,
  content,
  modes = { listening: true, speaking: true },
  onFinish,
  onLeave,
  extras,
  onSummary,
  onOpenSettings,
  hearts,
  grammarNotes,
  onProgress,
  onPausedChange,
  newWords,
}: {
  /** How many exercises are done so far; the screen asks before leaving once this is above zero. */
  onProgress?: (done: number) => void;
  /** Hearts have run out (or come back) mid-lesson: the screen stops asking before leaving. */
  onPausedChange?: (paused: boolean) => void;
  /**
   * The words this learner has never met (`newWordsFor`: the server's list
   * for an account, the device's for a guest). Each is met on a card before
   * the first exercise that asks for it. Absent: no cards.
   */
  newWords?: ReadonlySet<string> | undefined;
  exercises: readonly RunnableExercise[];
  content: Content;
  modes?: ExerciseModes;
  /** Fires once, as soon as the last exercise is answered. */
  onFinish: (summary: LessonSummary) => void;
  /** The celebration sequence is over: back to the path. */
  onLeave: () => void;
  /** Streak, words learned and unit completion, once the caller knows them. */
  extras?: CelebrationExtras | null | undefined;
  /** Fires once when the last exercise is done, so the screen can drop its chrome. */
  onSummary?: () => void;
  onOpenSettings?: () => void;
  /**
   * Signed-in learners: a wrong answer costs a heart; none left pauses the
   * lesson. `lose` resolves to the server's answer (null for none); `plus`
   * is a purchase the store knows about before the server does.
   */
  hearts?: {
    state: HeartsState | null;
    blocked: boolean;
    lose: () => Promise<HeartsState | null> | void;
    onLater?: () => void;
    plus?: boolean;
  };
  /**
   * The published rules this lesson's skill teaches (docs/GRAMMAR.md). The
   * first the learner has not dismissed stands in front of the drill; after
   * a wrong answer the check bar names it.
   */
  grammarNotes?: readonly GrammarNoteView[] | undefined;
}) {
  const t = useT();
  const m = useMotion();
  const tuning = useTuning();
  const [index, setIndex] = useState(0);
  const [xp, setXp] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [mistakes, setMistakes] = useState<MistakeEntry[]>([]);
  const [run, setRun] = useState(0);
  // Hearts this lesson has cost, counted here so the strip breaks one at
  // once; the server's count stays the ceiling (`lessonHeartsView`).
  const [tally, setTally] = useState<HeartsTally>(NO_HEARTS_LOST);
  // The words already met on a card in this lesson: never shown twice, even
  // when a fresher payload or a mode switch moves the plan under the learner.
  const [introduced, setIntroduced] = useState<ReadonlySet<string>>(() => new Set());
  // AsyncStorage is async, so the answer is read once and held: a note must
  // never flicker back in halfway through a lesson. `null` means "not known
  // yet", which suppresses the note rather than showing one that has already
  // been dismissed.
  const [seenNotes, setSeenNotes] = useState<readonly string[] | null>(null);
  useEffect(() => {
    let live = true;
    void readSeenNotes().then((ids) => {
      if (live) setSeenNotes(ids);
      return ids;
    });
    return () => {
      live = false;
    };
  }, []);
  const active = useMemo(() => filterExercises(exercises, modes), [exercises, modes]);
  const decoded = active.map((e) => ({
    id: e.id,
    moment: e.moment ?? null,
    result: decodeExercisePayload(e.payload),
  }));
  const current = decoded[index];
  const finished = active.length > 0 && !current;
  // Planned over the lesson as it actually runs under the modes, so a word
  // whose first exercise was dropped is met before the next one instead.
  const plan = newWordIntroductions({
    exercises: active.map((e) => ({ id: e.id, type: e.type, teaches: e.teaches })),
    isNew: (id) => newWords?.has(id) ?? false,
    canShow: (id) => content.lexemes[id] !== undefined,
  });
  const heartsView = lessonHeartsView(hearts?.state, tally, hearts?.plus ?? false);
  // Out of hearts: the server says none, or this lesson's own losses do and
  // the server has not caught up yet. Either way the next exercise must not
  // flash up first.
  const paused = heartsRunOut(heartsView) && !finished;
  useEffect(() => {
    onPausedChange?.(paused);
  }, [paused, onPausedChange]);
  const answered = active.length - skipped;
  const perfect = answered > 0 && correct === answered;
  const summary: LessonSummary = {
    xp: xp + (perfect ? tuning.xp.perfectLessonBonus : 0),
    correct,
    total: answered,
    skipped,
    mistakes,
  };
  useEffect(() => {
    if (finished) onSummary?.();
  }, [finished, onSummary]);
  useEffect(() => {
    onProgress?.(index);
  }, [index, onProgress]);
  // The report goes out once, the moment the lesson ends.
  const reported = useRef(false);
  const latest = useRef({ summary, onFinish });
  latest.current = { summary, onFinish };
  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;
    latest.current.onFinish(latest.current.summary);
  }, [finished]);

  if (active.length === 0) {
    return (
      <Card tone="sand">
        <Text className="font-display text-lg text-indigo">{t("lesson.emptyModes")}</Text>
        {onOpenSettings && (
          <View className="mt-4 items-start">
            <Button label={t("lesson.openSettings")} variant="indigo" onPress={onOpenSettings} />
          </View>
        )}
      </Card>
    );
  }

  const strip = (
    <LessonStrip index={index} total={active.length} xp={xp} run={run} hearts={heartsView} />
  );

  // Out of hearts mid-lesson: the lesson pauses here, under the strip where
  // the last heart has just broken, with its answers kept; practice or Plus
  // reopens it. Before the rule, too: no rule to read with no hearts left.
  if (paused && hearts?.state) {
    return (
      <View>
        {strip}
        <OutOfHearts state={{ ...hearts.state, hearts: 0 }} onLater={hearts.onLater} />
      </View>
    );
  }

  // The rule in front of the drill, and the one a wrong answer is named
  // after. `atStart` is what keeps a note from interrupting: it can only
  // appear on the lesson's first exercise, never between two of them.
  const notes = grammarNotes ?? [];
  const pending =
    seenNotes === null
      ? null
      : pickGrammarNote({ notes, seen: seenNotes, atStart: index === 0 && !finished });
  const pattern = correctionNoteFor(notes, pending?.id ?? null);

  if (pending) {
    return (
      <GrammarNote
        note={pending}
        audio={content.audioAssets}
        onContinue={() => void markNoteSeen(pending.id).then(setSeenNotes)}
        onSkip={() => void markNoteSeen(pending.id).then(setSeenNotes)}
      />
    );
  }

  if (!current) {
    return (
      <Celebration
        beats={celebrationBeats(
          {
            xp: summary.xp,
            correct: summary.correct,
            total: summary.total,
            ...extras,
          },
          // The knobs panel's thresholds, so the medal beat can be watched
          // at a number a real lesson would take a month to reach.
          { milestones: tuning.milestones },
        )}
        onDone={onLeave}
      />
    );
  }

  const onDone: Done = (r) => {
    setXp((x) => x + r.xp);
    // A skipped exercise is neither right nor wrong: it leaves the run alone.
    if (!r.skipped) setRun((n) => nextRun(n, r.correct));
    if (r.skipped) setSkipped((n) => n + 1);
    else if (r.correct) setCorrect((c) => c + 1);
    else {
      // The strip breaks the heart now; the server's answer then becomes
      // the count it goes on from.
      setTally((n) => tallyHeartLost(n, hearts?.state, hearts?.plus ?? false));
      void Promise.resolve(hearts?.lose())
        .then((answer) => {
          setTally((n) => tallyHeartAnswered(n, answer ?? null));
          return answer;
        })
        .catch(() => null);
      // File the word for "practise mistakes"; the server keeps only the
      // words this lesson actually teaches.
      const payload = Either.getOrNull(current.result);
      const lexemeId = payload ? mistakeLexemeId(payload) : null;
      if (payload && lexemeId)
        setMistakes((ms) => [...ms, { lexemeId, exerciseType: payload.type }]);
    }
    setIndex((i) => i + 1);
  };

  // New words first: a card in front of the exercise, unscored, and the
  // strip stays where it is until the exercise itself is answered.
  const meet = wordsToMeet(plan, current.id, introduced);

  return (
    <View>
      {strip}
      {!modes.listening && (
        <Text className="mb-3 font-body-semibold text-xs text-mist">{t("lesson.quietOn")}</Text>
      )}
      {meet.length > 0 ? (
        <Animated.View key={`meet-${current.id}`} entering={FadeIn.duration(m.enter)}>
          <NewWords
            words={meet}
            content={content}
            listening={modes.listening}
            onContinue={() => setIntroduced((met) => new Set([...met, ...meet]))}
          />
        </Animated.View>
      ) : (
        <Animated.View key={current.id} entering={FadeIn.duration(m.enter)}>
          <MomentBadge moment={current.moment} />
          {/* The exercise's id, for "report this exercise" in the check bar. */}
          <CurrentExercise id={current.id}>
            <CurrentPattern note={pattern}>
              {Either.isRight(current.result) ? (
                <Exercise
                  payload={current.result.right}
                  content={content}
                  onDone={onDone}
                  quiet={!modes.listening}
                />
              ) : (
                <Unsupported onDone={onDone} />
              )}
            </CurrentPattern>
          </CurrentExercise>
        </Animated.View>
      )}
    </View>
  );
}

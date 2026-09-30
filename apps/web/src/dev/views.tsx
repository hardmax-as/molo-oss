/**
 * One view per demo id. Every one of them renders the **real** component
 * with fabricated props — never a copy of it — so the gallery cannot drift
 * away from what a learner sees. Where a component could not be driven by
 * props alone it was given the smallest seam that lets it be, and the app
 * uses the same seam (`components/exercises/LessonProgress.tsx`,
 * `components/LeagueBoard.tsx`, `WordHint`'s `defaultOpen`, `Launch`'s
 * `force`, the exported `ReportDialog`).
 *
 * `Record<ViewDemoId, …>` is what keeps this file and `catalog.ts` in step:
 * a catalogued demo without a view here does not compile.
 */

import type { CelebrationBeat, ExerciseType } from "@molo/core";
import { useNavigate } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Celebration } from "~/components/celebration/Celebration.tsx";
import { CheckBar } from "~/components/exercises/CheckBar.tsx";
import { ClassSort } from "~/components/exercises/ClassSort.tsx";
import { ClickDrill } from "~/components/exercises/ClickDrill.tsx";
import { ClickIdentify } from "~/components/exercises/ClickIdentify.tsx";
import { ConcordFill } from "~/components/exercises/ConcordFill.tsx";
import { CultureCard } from "~/components/exercises/CultureCard.tsx";
import { LessonProgressBar, RunCounter } from "~/components/exercises/LessonProgress.tsx";
import { ListenSelect } from "~/components/exercises/ListenSelect.tsx";
import { MatchPairs } from "~/components/exercises/MatchPairs.tsx";
import { MomentBadge } from "~/components/exercises/MomentBadge.tsx";
import {
  CurrentExercise,
  ReportAction,
  ReportDialog,
  ReportSignUpDialog,
} from "~/components/exercises/ReportAction.tsx";
import { SelectListen } from "~/components/exercises/SelectListen.tsx";
import { Speak } from "~/components/exercises/Speak.tsx";
import { SpeechBubble } from "~/components/exercises/SpeechBubble.tsx";
import { TranslateTap } from "~/components/exercises/TranslateTap.tsx";
import { TranslateType } from "~/components/exercises/TranslateType.tsx";
import { glossForHint, WordHint } from "~/components/exercises/WordHint.tsx";
import { GrammarNote } from "~/components/grammar/GrammarNote.tsx";
import { MorphemeSplit } from "~/components/grammar/MorphemeSplit.tsx";
import { CurrentPattern } from "~/components/grammar/PatternCorrection.tsx";
import { Launch } from "~/components/Launch.tsx";
import { LeagueBoard } from "~/components/LeagueBoard.tsx";
import { LevelUp } from "~/components/LevelUp.tsx";
import { OutOfHearts } from "~/components/OutOfHearts.tsx";
import { ChestNode } from "~/components/path/ChestNode.tsx";
import { LessonNode } from "~/components/path/LessonNode.tsx";
import { PathGuide } from "~/components/path/PathGuide.tsx";
import { UnitBanner } from "~/components/path/UnitBanner.tsx";
import { PracticeCard, type PracticeAction } from "~/components/PracticeCard.tsx";
import { SaveProgressWall } from "~/components/SaveProgressWall.tsx";
import { Button } from "~/components/ui/Button.tsx";
import { useT } from "~/lib/i18n.tsx";

import type { ViewDemoId } from "./catalog.ts";
import {
  chestRow,
  CROWN_LEVELS,
  DEMO_CONTENT,
  DEMO_GRAMMAR_NOTE,
  DEMO_LEAGUE_HISTORY,
  DEMO_PAYLOADS,
  demoLeague,
  demoPathRows,
  demoUnitRow,
  FIXTURE_IDS,
  FULL_SEQUENCE,
  LESSON_BEAT,
  LESSON_BEAT_FLAWLESS,
  milestoneBeat,
  NODE_KINDS,
  NO_HEARTS,
  RECALL_LEXEME,
  streakBeat,
  unitBeat,
} from "./fixtures.ts";
import { DEV_STRINGS } from "./strings.ts";

export interface DemoView {
  readonly Component: ComponentType;
  /** The view covers the page itself (a celebration, the level-up sky, the greeting). */
  readonly overlay?: boolean;
}

/** A developer-only caption. Never on a learner's screen; see `strings.ts`. */
function Caption({ children }: { children: string }) {
  return <p className="text-xs font-bold uppercase tracking-wide text-mist">{children}</p>;
}

/** Re-mounts a widget so an answered exercise can be answered again. */
function useReplay(): [number, () => void] {
  const [round, setRound] = useState(0);
  return [round, () => setRound((r) => r + 1)];
}

function CelebrationDemo({ beats }: { beats: readonly CelebrationBeat[] }) {
  const navigate = useNavigate();
  return <Celebration beats={beats} onDone={() => void navigate({ to: "/dev" })} />;
}

function exerciseView(type: ExerciseType): ComponentType {
  return function ExerciseDemo() {
    const [round, replay] = useReplay();
    const payload = DEMO_PAYLOADS[type];
    const props = { content: DEMO_CONTENT, onDone: replay } as const;
    return (
      <div key={round} className="mx-auto max-w-2xl rounded-3xl bg-cloud p-5 shadow-card sm:p-8">
        {payload.type === "listen_select" && <ListenSelect payload={payload} {...props} />}
        {payload.type === "select_listen" && <SelectListen payload={payload} {...props} />}
        {payload.type === "match_pairs" && <MatchPairs payload={payload} {...props} />}
        {payload.type === "class_sort" && <ClassSort payload={payload} {...props} />}
        {payload.type === "translate_tap" && <TranslateTap payload={payload} {...props} />}
        {payload.type === "translate_type" && <TranslateType payload={payload} {...props} />}
        {payload.type === "concord_fill" && <ConcordFill payload={payload} {...props} />}
        {payload.type === "click_drill" && <ClickDrill payload={payload} {...props} />}
        {payload.type === "speak" && <Speak payload={payload} {...props} />}
        {payload.type === "culture_card" && <CultureCard payload={payload} {...props} />}
        {payload.type === "click_identify" && <ClickIdentify payload={payload} {...props} />}
      </div>
    );
  };
}

function PathRowsDemo({ locked }: { locked: boolean }) {
  const rows = demoPathRows({ locked });
  return (
    <div className="mx-auto max-w-md">
      <UnitBanner row={demoUnitRow(locked)} onOpenWords={() => undefined} />
      <ol className="space-y-4">
        {rows.map((row) =>
          row.type === "lesson" ? (
            <li key={row.key} className="flex justify-center">
              <LessonNode row={row} />
            </li>
          ) : row.type === "chest" ? (
            <li key={row.key} className="flex justify-center">
              <ChestNode row={row} busy={false} onClaim={() => undefined} />
            </li>
          ) : null,
        )}
      </ol>
    </div>
  );
}

function PracticeDemo({ actions }: { actions: readonly PracticeAction[] }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PracticeCard
        id="dev-practice"
        lexeme={RECALL_LEXEME}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        actions={actions}
        onAnswer={() => setRevealed(false)}
      />
      {revealed && (
        <Button variant="ghost" onClick={() => setRevealed(false)}>
          {DEV_STRINGS.captions.hide}
        </Button>
      )}
    </div>
  );
}

const SENTENCE = DEMO_CONTENT.sentences[FIXTURE_IDS.sentence];

export const DEMO_VIEWS: Record<ViewDemoId, DemoView> = {
  // --- after a lesson ----------------------------------------------------
  "lesson-complete": { overlay: true, Component: () => <CelebrationDemo beats={[LESSON_BEAT]} /> },
  "lesson-complete-flawless": {
    overlay: true,
    Component: () => <CelebrationDemo beats={[LESSON_BEAT_FLAWLESS]} />,
  },
  "streak-extended": {
    overlay: true,
    Component: () => <CelebrationDemo beats={[streakBeat(false)]} />,
  },
  "streak-frozen": {
    overlay: true,
    Component: () => <CelebrationDemo beats={[streakBeat(true)]} />,
  },
  "milestone-25": {
    overlay: true,
    Component: () => <CelebrationDemo beats={[milestoneBeat(25)]} />,
  },
  "milestone-50": {
    overlay: true,
    Component: () => <CelebrationDemo beats={[milestoneBeat(50)]} />,
  },
  "milestone-100": {
    overlay: true,
    Component: () => <CelebrationDemo beats={[milestoneBeat(100)]} />,
  },
  "milestone-250": {
    overlay: true,
    Component: () => <CelebrationDemo beats={[milestoneBeat(250)]} />,
  },
  "milestone-500": {
    overlay: true,
    Component: () => <CelebrationDemo beats={[milestoneBeat(500)]} />,
  },
  "unit-finished": {
    overlay: true,
    Component: () => <CelebrationDemo beats={[unitBeat(false)]} />,
  },
  "unit-finished-flawless": {
    overlay: true,
    Component: () => <CelebrationDemo beats={[unitBeat(true)]} />,
  },
  "celebration-sequence": {
    overlay: true,
    Component: () => <CelebrationDemo beats={FULL_SEQUENCE} />,
  },
  "level-up": {
    overlay: true,
    Component: function LevelUpDemo() {
      const [level, setLevel] = useState<number | null>(7);
      return (
        <>
          <LevelUp level={level} onClose={() => setLevel(null)} />
          {level === null && <Button onClick={() => setLevel(7)}>{DEV_STRINGS.replay}</Button>}
        </>
      );
    },
  },

  // --- during a lesson ---------------------------------------------------
  "exercise-listen-select": { Component: exerciseView("listen_select") },
  "exercise-select-listen": { Component: exerciseView("select_listen") },
  "exercise-match-pairs": { Component: exerciseView("match_pairs") },
  "exercise-class-sort": { Component: exerciseView("class_sort") },
  "exercise-translate-tap": { Component: exerciseView("translate_tap") },
  "exercise-translate-type": { Component: exerciseView("translate_type") },
  "exercise-concord-fill": { Component: exerciseView("concord_fill") },
  "exercise-click-drill": { Component: exerciseView("click_drill") },
  "exercise-speak": { Component: exerciseView("speak") },
  "exercise-culture-card": { Component: exerciseView("culture_card") },
  "exercise-click-identify": { Component: exerciseView("click_identify") },
  "badge-new-word": { Component: () => <MomentBadge moment="new_word" /> },
  "badge-tricky": { Component: () => <MomentBadge moment="tricky" /> },
  "run-counter-three": {
    Component: () => (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <LessonProgressBar index={4} total={10} run={3} />
        </div>
        <RunCounter run={3} />
      </div>
    ),
  },
  "run-counter-seven": {
    Component: () => (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <LessonProgressBar index={8} total={10} run={7} />
        </div>
        <RunCounter run={7} />
      </div>
    ),
  },
  "speech-bubble": {
    Component: () => (
      <div className="mx-auto max-w-2xl space-y-4">
        <Caption>{DEV_STRINGS.captions.listening}</Caption>
        <SpeechBubble speaker="listening">
          <p className="text-lg font-semibold text-ink">{SENTENCE?.gloss?.gloss ?? ""}</p>
        </SpeechBubble>
        <Caption>{DEV_STRINGS.captions.teaching}</Caption>
        <SpeechBubble speaker="teaching">
          <p className="font-display text-2xl text-ink">{SENTENCE?.textXh ?? ""}</p>
        </SpeechBubble>
        <Caption>{DEV_STRINGS.captions.producing}</Caption>
        <SpeechBubble speaker="producing">
          <p className="text-lg font-semibold text-ink">{SENTENCE?.gloss?.gloss ?? ""}</p>
        </SpeechBubble>
      </div>
    ),
  },
  "word-hint-open": {
    Component: function WordHintDemo() {
      // The last token is "under test", so it renders as plain text: a hint
      // may never be the answer.
      const hidden = new Set((SENTENCE?.tokens ?? []).slice(-1).map((k) => k.lexemeId));
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <Caption>{DEV_STRINGS.captions.wordHint}</Caption>
          <SpeechBubble speaker="teaching">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-6 font-display text-2xl text-ink">
              {(SENTENCE?.tokens ?? []).map((k, i) => (
                <WordHint
                  key={k.position}
                  word={k.surfaceForm}
                  gloss={glossForHint(DEMO_CONTENT, k.lexemeId, hidden)}
                  defaultOpen={i === 0}
                />
              ))}
            </p>
          </SpeechBubble>
        </div>
      );
    },
  },
  "check-bar-unanswered": {
    Component: () => (
      <div className="mx-auto max-w-2xl">
        <CheckBar canCheck checked={null} onCheck={() => undefined} onContinue={() => undefined} />
      </div>
    ),
  },
  "check-bar-right": {
    Component: () => (
      <div className="mx-auto max-w-2xl">
        <CheckBar checked canCheck={false} onCheck={() => undefined} onContinue={() => undefined} />
      </div>
    ),
  },
  "check-bar-wrong": {
    Component: function CheckBarWrongDemo() {
      const t = useT();
      return (
        <div className="mx-auto max-w-2xl">
          <CheckBar
            canCheck={false}
            checked={false}
            correctAnswer={RECALL_LEXEME?.lemma ?? ""}
            hint={t("lesson.clickHint", { letters: "c" })}
            onCheck={() => undefined}
            onContinue={() => undefined}
          />
        </div>
      );
    },
  },
  "grammar-note": {
    Component: () => (
      <div className="mx-auto max-w-2xl">
        <GrammarNote
          note={DEMO_GRAMMAR_NOTE}
          audio={{}}
          onContinue={() => undefined}
          onSkip={() => undefined}
        />
      </div>
    ),
  },
  "grammar-correction": {
    Component: () => (
      <div className="mx-auto max-w-2xl">
        <CurrentPattern note={DEMO_GRAMMAR_NOTE}>
          <CheckBar
            canCheck={false}
            checked={false}
            correctAnswer={DEMO_GRAMMAR_NOTE.cells[0]?.surfaceForm ?? ""}
            onCheck={() => undefined}
            onContinue={() => undefined}
          />
        </CurrentPattern>
      </div>
    ),
  },
  "grammar-morphemes": {
    Component: () => (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <MorphemeSplit surfaceForm="zz-inca" morphemes={["zz", "inca"]} size="lg" />
        <MorphemeSplit surfaceForm="zz-unsegmented" morphemes={[]} size="lg" />
        <MorphemeSplit surfaceForm="zz-" morphemes={["zz-"]} size="md" />
      </div>
    ),
  },
  "report-exercise": {
    Component: function ReportDemo() {
      const [open, setOpen] = useState<"form" | "wall" | null>(null);
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <Caption>{DEV_STRINGS.captions.signedInOnly}</Caption>
          <CurrentExercise id="00000000-0000-4000-8000-00000000f0e1">
            <ReportAction />
          </CurrentExercise>
          <div className="flex flex-wrap gap-3">
            <Button variant="indigo" onClick={() => setOpen("form")}>
              {DEV_STRINGS.captions.openReport}
            </Button>
            <Button variant="outline" onClick={() => setOpen("wall")}>
              {DEV_STRINGS.captions.openReportGuest}
            </Button>
          </div>
          {open === "form" && (
            <ReportDialog
              exerciseId="00000000-0000-4000-8000-00000000f0e1"
              onClose={() => setOpen(null)}
            />
          )}
          {open === "wall" && <ReportSignUpDialog onClose={() => setOpen(null)} />}
        </div>
      );
    },
  },

  // --- the path ----------------------------------------------------------
  "path-unit-open": { Component: () => <PathRowsDemo locked={false} /> },
  "path-unit-locked": { Component: () => <PathRowsDemo locked /> },
  "path-node-kinds": {
    Component: () => (
      <ul className="mx-auto flex max-w-md flex-wrap justify-center gap-6">
        {NODE_KINDS.map((row) => (
          <li key={row.key} className="text-center">
            <LessonNode row={row} />
            <Caption>{row.kind}</Caption>
          </li>
        ))}
      </ul>
    ),
  },
  "path-chest-ready": {
    Component: () => (
      <div className="flex flex-col items-center gap-2">
        <ChestNode row={chestRow("ready")} busy={false} onClaim={() => undefined} />
        <Caption>{DEV_STRINGS.captions.chestReady}</Caption>
      </div>
    ),
  },
  "path-chest-claimed": {
    Component: () => (
      <div className="flex flex-col items-center gap-2">
        <ChestNode row={chestRow("claimed")} busy={false} onClaim={() => undefined} />
        <Caption>{DEV_STRINGS.captions.chestClaimed}</Caption>
      </div>
    ),
  },
  "path-crown-levels": {
    Component: () => (
      <ul className="mx-auto flex max-w-md flex-wrap justify-center gap-6">
        {CROWN_LEVELS.map((row) => (
          <li key={row.key} className="text-center">
            <LessonNode row={row} />
            <Caption>{`${DEV_STRINGS.captions.crownLevel} ${row.crownLevel}`}</Caption>
          </li>
        ))}
      </ul>
    ),
  },
  "path-guide": {
    Component: () => (
      <div className="mx-auto max-w-md space-y-6">
        <Caption>{DEV_STRINGS.captions.guideFirst}</Caption>
        <PathGuide speak="first" />
        <Caption>{DEV_STRINGS.captions.guideBack}</Caption>
        <PathGuide speak="back" />
      </div>
    ),
  },

  // --- walls and sheets ---------------------------------------------------
  "out-of-hearts": {
    Component: function OutOfHeartsDemo() {
      const navigate = useNavigate();
      return <OutOfHearts state={NO_HEARTS} onLeave={() => void navigate({ to: "/dev" })} />;
    },
  },
  "out-of-hearts-no-way-back": { Component: () => <OutOfHearts state={NO_HEARTS} /> },
  "save-progress-wall": { Component: () => <SaveProgressWall xp={140} lessons={2} /> },

  // --- elsewhere ----------------------------------------------------------
  "leagues-populated": {
    Component: () => <LeagueBoard data={demoLeague(true)} history={DEMO_LEAGUE_HISTORY} />,
  },
  "leagues-empty": { Component: () => <LeagueBoard data={demoLeague(false)} /> },
  "review-session": {
    Component: function ReviewSessionDemo() {
      const t = useT();
      return (
        <PracticeDemo
          actions={[
            { key: 1, label: t("review.again"), variant: "coral" },
            { key: 2, label: t("review.hard"), variant: "primary" },
            { key: 3, label: t("review.good"), variant: "sea" },
            { key: 4, label: t("review.easy"), variant: "indigo" },
          ]}
        />
      );
    },
  },
  "mistakes-session": {
    Component: function MistakesSessionDemo() {
      const t = useT();
      return (
        <PracticeDemo
          actions={[
            { key: "wrong", label: t("mistakes.stillLearning"), variant: "coral" },
            { key: "right", label: t("mistakes.knewIt"), variant: "sea" },
          ]}
        />
      );
    },
  },
  toasts: {
    Component: () => (
      <div className="mx-auto max-w-lg space-y-3">
        <Caption>{DEV_STRINGS.captions.toasts}</Caption>
        <div className="flex flex-wrap gap-3">
          <Button variant="indigo" onClick={() => toast(DEV_STRINGS.captions.toastMessage)}>
            {DEV_STRINGS.captions.toastDefault}
          </Button>
          <Button variant="sea" onClick={() => toast.success(DEV_STRINGS.captions.toastMessage)}>
            {DEV_STRINGS.captions.toastSuccess}
          </Button>
          <Button variant="coral" onClick={() => toast.error(DEV_STRINGS.captions.toastMessage)}>
            {DEV_STRINGS.captions.toastError}
          </Button>
        </div>
      </div>
    ),
  },
  launch: {
    Component: function LaunchDemo() {
      const [round, replay] = useReplay();
      return (
        <div className="mx-auto max-w-lg">
          <Launch key={round} force />
          <Button onClick={replay}>{DEV_STRINGS.replay}</Button>
        </div>
      );
    },
  },
};

/**
 * One view per demo id. Every one of them renders the **real** component
 * with fabricated props — never a copy of it — so the gallery cannot drift
 * away from what a learner sees. Where a component could not be driven by
 * props alone it was given the smallest seam that lets it be, and the seam
 * is used by the app too (`components/path/PathNodes.tsx`,
 * `components/exercises/LessonStrip.tsx`, `WordHint`'s `defaultOpen`,
 * `Launch`'s `force`, `LeagueBoard`).
 *
 * `Record<ViewDemoId, …>` is what keeps this file and `catalog.ts` in step:
 * a catalogued demo without a view here does not compile.
 */

import { useRouter } from "expo-router";
import type { ComponentType } from "react";
import { useState } from "react";
import { Text, View } from "react-native";

import { CheckBar } from "~/components/exercises/CheckBar.tsx";
import { ClassSort } from "~/components/exercises/ClassSort.tsx";
import { ClickDrill } from "~/components/exercises/ClickDrill.tsx";
import { ClickIdentify } from "~/components/exercises/ClickIdentify.tsx";
import { ConcordFill } from "~/components/exercises/ConcordFill.tsx";
import { CultureCard } from "~/components/exercises/CultureCard.tsx";
import { LessonStrip } from "~/components/exercises/LessonStrip.tsx";
import { ListenSelect } from "~/components/exercises/ListenSelect.tsx";
import { MatchPairs } from "~/components/exercises/MatchPairs.tsx";
import { MomentBadge } from "~/components/exercises/MomentBadge.tsx";
import {
  CurrentExercise,
  ReportAction,
  ReportSheet,
  ReportSignUpSheet,
} from "~/components/exercises/ReportAction.tsx";
import { SelectListen } from "~/components/exercises/SelectListen.tsx";
import { Speak } from "~/components/exercises/Speak.tsx";
import { SpeechBubble } from "~/components/exercises/SpeechBubble.tsx";
import { TranslateTap } from "~/components/exercises/TranslateTap.tsx";
import { TranslateType } from "~/components/exercises/TranslateType.tsx";
import { glossForHint, WordHint } from "~/components/exercises/WordHint.tsx";
import { GrammarNote } from "~/components/grammar/GrammarNote.tsx";
import { CurrentPattern } from "~/components/grammar/PatternCorrection.tsx";
import { LeagueBoard } from "~/components/LeagueBoard.tsx";
import { OutOfHearts } from "~/components/OutOfHearts.tsx";
import { ChestNode, LessonNode, PathGuide, UnitBanner } from "~/components/path/PathNodes.tsx";
import { RecallCard } from "~/components/RecallCard.tsx";
import { SaveProgressWall } from "~/components/SaveProgressWall.tsx";
import { demoGrammarNote } from "~/fixtures/demo-unit.ts";
import { useT } from "~/lib/i18n.tsx";
import { Button } from "~/ui/Button.tsx";
import { Celebration } from "~/ui/celebration/Celebration.tsx";
import { Launch } from "~/ui/Launch.tsx";
import { LevelUp } from "~/ui/LevelUp.tsx";
import { Screen } from "~/ui/Screen.tsx";
import { useToast } from "~/ui/Toast.tsx";

import type { ViewDemoId } from "./catalog.ts";
import {
  chestRow,
  CROWN_LEVELS,
  DEMO_CONTENT,
  DEMO_LEAGUE_HISTORY,
  DEMO_PAYLOADS,
  DEMO_SENTENCE_ID,
  demoLeague,
  demoPathRows,
  demoUnitRow,
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
  /** The ground the real screen puts this on. */
  readonly tone?: "sand" | "indigo";
  /** The view fills the screen itself, so the gallery adds no padding. */
  readonly bleed?: boolean;
}

/** A developer-only caption. Never on a learner's screen; see `strings.ts`. */
function Caption({ children }: { children: string }) {
  return <Text className="font-body text-xs uppercase tracking-wide text-mist">{children}</Text>;
}

/** Re-mounts a widget so an answered exercise can be answered again. */
function useReplay(): [number, () => void] {
  const [round, setRound] = useState(0);
  return [round, () => setRound((r) => r + 1)];
}

function CelebrationDemo({ beats }: { beats: Parameters<typeof Celebration>[0]["beats"] }) {
  const router = useRouter();
  return (
    <View className="flex-1 justify-center px-5">
      <Celebration beats={beats} onDone={() => router.back()} />
    </View>
  );
}

function exerciseView(type: keyof typeof DEMO_PAYLOADS): ComponentType {
  return function ExerciseDemo() {
    const [round, replay] = useReplay();
    const payload = DEMO_PAYLOADS[type];
    const props = { content: DEMO_CONTENT, onDone: replay } as const;
    return (
      <Screen>
        <View key={round}>
          {payload.type === "listen_select" && (
            <ListenSelect payload={payload} {...props} quiet={false} />
          )}
          {payload.type === "select_listen" && (
            <SelectListen payload={payload} {...props} quiet={false} />
          )}
          {payload.type === "match_pairs" && <MatchPairs payload={payload} {...props} />}
          {payload.type === "class_sort" && <ClassSort payload={payload} {...props} />}
          {payload.type === "translate_tap" && <TranslateTap payload={payload} {...props} />}
          {payload.type === "translate_type" && <TranslateType payload={payload} {...props} />}
          {payload.type === "concord_fill" && <ConcordFill payload={payload} {...props} />}
          {payload.type === "click_drill" && <ClickDrill payload={payload} {...props} />}
          {payload.type === "speak" && <Speak payload={payload} {...props} />}
          {payload.type === "culture_card" && <CultureCard payload={payload} {...props} />}
          {payload.type === "click_identify" && <ClickIdentify payload={payload} {...props} />}
        </View>
      </Screen>
    );
  };
}

function PathRowsDemo({ locked }: { locked: boolean }) {
  const rows = demoPathRows({ locked });
  return (
    <Screen>
      <UnitBanner row={demoUnitRow(locked)} />
      {rows.map((row) =>
        row.type === "lesson" ? (
          <View key={row.key} className="items-center">
            <LessonNode row={row} onPress={() => undefined} />
          </View>
        ) : row.type === "chest" ? (
          <View key={row.key} className="items-center">
            <ChestNode row={row} busy={false} onClaim={() => undefined} />
          </View>
        ) : null,
      )}
    </Screen>
  );
}

function RecallDemo({ actions }: { actions: Parameters<typeof RecallCard>[0]["actions"] }) {
  const [revealed, setRevealed] = useState(false);
  // The buttons come from the caller with the same i18n keys the real
  // sessions use, so nothing here invents a label a learner would see.
  return (
    <Screen>
      <RecallCard
        id="dev-recall"
        lexeme={RECALL_LEXEME}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        actions={actions}
        onAnswer={() => setRevealed(false)}
      />
      {revealed && (
        <View className="items-start">
          <Button
            label={DEV_STRINGS.captions.hide}
            variant="ghost"
            onPress={() => setRevealed(false)}
          />
        </View>
      )}
    </Screen>
  );
}

export const DEMO_VIEWS: Record<ViewDemoId, DemoView> = {
  // --- after a lesson ----------------------------------------------------
  "lesson-complete": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={[LESSON_BEAT]} />,
  },
  "lesson-complete-flawless": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={[LESSON_BEAT_FLAWLESS]} />,
  },
  "streak-extended": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={[streakBeat(false)]} />,
  },
  "streak-frozen": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={[streakBeat(true)]} />,
  },
  "milestone-25": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={[milestoneBeat(25)]} />,
  },
  "milestone-50": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={[milestoneBeat(50)]} />,
  },
  "milestone-100": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={[milestoneBeat(100)]} />,
  },
  "milestone-250": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={[milestoneBeat(250)]} />,
  },
  "milestone-500": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={[milestoneBeat(500)]} />,
  },
  "unit-finished": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={[unitBeat(false)]} />,
  },
  "unit-finished-flawless": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={[unitBeat(true)]} />,
  },
  "celebration-sequence": {
    tone: "indigo",
    bleed: true,
    Component: () => <CelebrationDemo beats={FULL_SEQUENCE} />,
  },
  "level-up": {
    tone: "indigo",
    bleed: true,
    Component: function LevelUpDemo() {
      const router = useRouter();
      return (
        <View className="flex-1">
          <LevelUp level={7} onClose={() => router.back()} />
        </View>
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
  "badge-new-word": {
    Component: () => (
      <Screen>
        <MomentBadge moment="new_word" />
      </Screen>
    ),
  },
  "badge-tricky": {
    Component: () => (
      <Screen>
        <MomentBadge moment="tricky" />
      </Screen>
    ),
  },
  "run-counter-three": {
    Component: () => (
      <Screen>
        <LessonStrip index={4} total={10} xp={40} run={3} />
      </Screen>
    ),
  },
  "run-counter-seven": {
    Component: () => (
      <Screen>
        <LessonStrip index={8} total={10} xp={90} run={7} />
      </Screen>
    ),
  },
  "speech-bubble": {
    Component: () => (
      <Screen>
        <Caption>{DEV_STRINGS.captions.listening}</Caption>
        <SpeechBubble speaker="listening">
          <Text className="font-body-semibold text-lg text-ink">
            {DEMO_CONTENT.sentences[DEMO_SENTENCE_ID]?.gloss?.gloss ?? ""}
          </Text>
        </SpeechBubble>
        <Caption>{DEV_STRINGS.captions.teaching}</Caption>
        <SpeechBubble speaker="teaching">
          <Text className="font-body-semibold text-lg text-ink">
            {DEMO_CONTENT.sentences[DEMO_SENTENCE_ID]?.textXh ?? ""}
          </Text>
        </SpeechBubble>
        <Caption>{DEV_STRINGS.captions.producing}</Caption>
        <SpeechBubble speaker="producing">
          <Text className="font-body-semibold text-lg text-ink">
            {DEMO_CONTENT.sentences[DEMO_SENTENCE_ID]?.gloss?.gloss ?? ""}
          </Text>
        </SpeechBubble>
      </Screen>
    ),
  },
  "word-hint-open": {
    Component: function WordHintDemo() {
      const sentence = DEMO_CONTENT.sentences[DEMO_SENTENCE_ID];
      // The last token is "under test", so it renders as plain text: a hint
      // may never be the answer.
      const hidden = new Set((sentence?.tokens ?? []).slice(-1).map((k) => k.lexemeId));
      return (
        <Screen>
          <Caption>{DEV_STRINGS.captions.wordHint}</Caption>
          <SpeechBubble speaker="teaching">
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-8">
              {(sentence?.tokens ?? []).map((k, i) => (
                <WordHint
                  key={k.position}
                  word={k.surfaceForm}
                  gloss={glossForHint(DEMO_CONTENT, k.lexemeId, hidden)}
                  defaultOpen={i === 0}
                />
              ))}
            </View>
          </SpeechBubble>
        </Screen>
      );
    },
  },
  "check-bar-unanswered": {
    Component: () => (
      <Screen>
        <CheckBar canCheck checked={null} onCheck={() => undefined} onContinue={() => undefined} />
      </Screen>
    ),
  },
  "check-bar-right": {
    Component: () => (
      <Screen>
        <CheckBar checked canCheck={false} onCheck={() => undefined} onContinue={() => undefined} />
      </Screen>
    ),
  },
  "check-bar-wrong": {
    Component: () => (
      <Screen>
        <CheckBar
          canCheck={false}
          checked={false}
          correctAnswer={RECALL_LEXEME?.lemma ?? ""}
          detail={RECALL_LEXEME?.gloss?.gloss ?? ""}
          onCheck={() => undefined}
          onContinue={() => undefined}
        />
      </Screen>
    ),
  },
  "grammar-note": {
    Component: () => (
      <Screen>
        <GrammarNote
          note={demoGrammarNote()}
          audio={{}}
          onContinue={() => undefined}
          onSkip={() => undefined}
        />
      </Screen>
    ),
  },
  "grammar-correction": {
    Component: () => (
      <Screen>
        <CurrentPattern note={demoGrammarNote()}>
          <CheckBar
            canCheck={false}
            checked={false}
            correctAnswer="umntu"
            onCheck={() => undefined}
            onContinue={() => undefined}
          />
        </CurrentPattern>
      </Screen>
    ),
  },
  "report-exercise": {
    Component: function ReportDemo() {
      const [open, setOpen] = useState<"form" | "wall" | null>(null);
      return (
        <Screen>
          <Caption>{DEV_STRINGS.captions.signedInOnly}</Caption>
          <CurrentExercise id="00000000-0000-4000-8000-00000000f0e1">
            <ReportAction onDark={false} />
          </CurrentExercise>
          <View className="items-start gap-3">
            <Button
              label={DEV_STRINGS.captions.openReport}
              variant="indigo"
              onPress={() => setOpen("form")}
            />
            <Button
              label={DEV_STRINGS.captions.openReportGuest}
              variant="cloud"
              onPress={() => setOpen("wall")}
            />
          </View>
          <ReportSheet
            exerciseId="00000000-0000-4000-8000-00000000f0e1"
            visible={open === "form"}
            onClose={() => setOpen(null)}
          />
          <ReportSignUpSheet visible={open === "wall"} onClose={() => setOpen(null)} />
        </Screen>
      );
    },
  },

  // --- the path ----------------------------------------------------------
  "path-unit-open": { Component: () => <PathRowsDemo locked={false} /> },
  "path-unit-locked": { Component: () => <PathRowsDemo locked /> },
  "path-node-kinds": {
    Component: () => (
      <Screen>
        {NODE_KINDS.map((row) => (
          <View key={row.key} className="items-center gap-1">
            <LessonNode row={row} onPress={() => undefined} />
            <Caption>{row.kind}</Caption>
          </View>
        ))}
      </Screen>
    ),
  },
  "path-chest-ready": {
    Component: () => (
      <Screen>
        <View className="items-center">
          <ChestNode row={chestRow("ready")} busy={false} onClaim={() => undefined} />
          <Caption>{DEV_STRINGS.captions.chestReady}</Caption>
        </View>
      </Screen>
    ),
  },
  "path-chest-claimed": {
    Component: () => (
      <Screen>
        <View className="items-center">
          <ChestNode row={chestRow("claimed")} busy={false} onClaim={() => undefined} />
          <Caption>{DEV_STRINGS.captions.chestClaimed}</Caption>
        </View>
      </Screen>
    ),
  },
  "path-crown-levels": {
    Component: () => (
      <Screen>
        {CROWN_LEVELS.map((row) => (
          <View key={row.key} className="items-center gap-1">
            <LessonNode row={row} onPress={() => undefined} />
            <Caption>{`${DEV_STRINGS.captions.crownLevel} ${row.crownLevel}`}</Caption>
          </View>
        ))}
      </Screen>
    ),
  },
  "path-guide": {
    Component: () => (
      <Screen>
        <Caption>{DEV_STRINGS.captions.guideFirst}</Caption>
        <PathGuide speak="first" />
        <Caption>{DEV_STRINGS.captions.guideBack}</Caption>
        <PathGuide speak="back" />
      </Screen>
    ),
  },

  // --- walls and sheets ---------------------------------------------------
  "out-of-hearts": {
    Component: function OutOfHeartsDemo() {
      const router = useRouter();
      return (
        <View className="flex-1 justify-center px-5">
          <OutOfHearts state={NO_HEARTS} onLater={() => router.back()} />
        </View>
      );
    },
  },
  "out-of-hearts-no-way-back": {
    Component: () => (
      <View className="flex-1 justify-center px-5">
        <OutOfHearts state={NO_HEARTS} />
      </View>
    ),
  },
  "save-progress-wall": {
    Component: function WallDemo() {
      const router = useRouter();
      return (
        <View className="flex-1 justify-center px-5">
          <SaveProgressWall xp={140} lessons={2} onLater={() => router.back()} />
        </View>
      );
    },
  },

  // --- elsewhere ----------------------------------------------------------
  "leagues-populated": {
    Component: () => (
      <Screen>
        <LeagueBoard data={demoLeague(true)} history={DEMO_LEAGUE_HISTORY} />
      </Screen>
    ),
  },
  "leagues-empty": {
    Component: () => (
      <Screen>
        <LeagueBoard data={demoLeague(false)} />
      </Screen>
    ),
  },
  "review-session": {
    Component: function ReviewSessionDemo() {
      const t = useT();
      return (
        <RecallDemo
          actions={[
            { key: 1, label: t("review.again"), variant: "coral" },
            { key: 2, label: t("review.hard"), variant: "sun" },
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
        <RecallDemo
          actions={[
            { key: "wrong", label: t("mistakes.stillLearning"), variant: "coral" },
            { key: "right", label: t("mistakes.knewIt"), variant: "sea" },
          ]}
        />
      );
    },
  },
  toasts: {
    Component: function ToastDemo() {
      const toast = useToast();
      return (
        <Screen>
          <Button
            label={DEV_STRINGS.captions.toastIndigo}
            variant="indigo"
            onPress={() => toast.show(DEV_STRINGS.captions.toastMessage, "indigo")}
          />
          <Button
            label={DEV_STRINGS.captions.toastSea}
            variant="sea"
            onPress={() => toast.show(DEV_STRINGS.captions.toastMessage, "sea")}
          />
          <Button
            label={DEV_STRINGS.captions.toastCoral}
            variant="coral"
            onPress={() => toast.show(DEV_STRINGS.captions.toastMessage, "coral")}
          />
        </Screen>
      );
    },
  },
  launch: {
    bleed: true,
    Component: function LaunchDemo() {
      const [round, replay] = useReplay();
      return (
        <View className="flex-1">
          <Launch key={round} force />
          <View className="mt-auto items-center p-5">
            <Button label={DEV_STRINGS.replay} variant="sun" onPress={replay} />
          </View>
        </View>
      );
    },
  },
};

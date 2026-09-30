import type { MistakesResponse } from "@molo/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FlipInEasyX } from "react-native-reanimated";

import { RecallCard, type RecallAction } from "~/components/RecallCard.tsx";
import { SaveProgressWall } from "~/components/SaveProgressWall.tsx";
import { getMistakes, localToday, localTzOffset, practiseMistake } from "~/lib/api.ts";
import { useLang, useT } from "~/lib/i18n.tsx";
import { applyAnswer, orderQueue } from "~/lib/mistakes-queue.ts";
import { useMe } from "~/lib/session.tsx";
import { useGuest } from "~/lib/use-guest.tsx";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Confetti } from "~/ui/Confetti.tsx";
import { haptic } from "~/ui/haptics.ts";
import { Penguin } from "~/ui/Mascots.tsx";
import { useMotion } from "~/ui/motion.ts";
import { Screen } from "~/ui/Screen.tsx";
import { useSfx } from "~/ui/sfx.tsx";
import { RecallSkeleton } from "~/ui/Skeleton.tsx";
import { XpChip } from "~/ui/XpChip.tsx";

type Mistake = MistakesResponse["mistakes"][number];

/**
 * "Practise mistakes": the review session's card over the words this
 * learner answered wrong in a lesson. Right clears the word, wrong leaves
 * it open for next time. Remediation, so no heart is ever spent here.
 */
export default function MistakesScreen() {
  const t = useT();
  const { lang } = useLang();
  const me = useMe();
  const guest = useGuest();
  const qc = useQueryClient();
  const router = useRouter();
  const sfx = useSfx();
  const m = useMotion();
  const mistakes = useQuery({
    queryKey: ["mistakes", lang],
    queryFn: () => getMistakes(lang),
    enabled: !!me.data,
    staleTime: Infinity,
  });
  // Taken straight from memory when the words are already there and current
  // (the mistakes card fetched them), so the first frame is a card, not a
  // flash of "nothing to practise". While a fresh read is out, wait for it.
  const [queue, setQueue] = useState<Mistake[] | null>(() =>
    mistakes.data && !mistakes.isFetching ? orderQueue([...mistakes.data.mistakes]) : null,
  );
  const [revealed, setRevealed] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [burst, setBurst] = useState(0);
  const [started, setStarted] = useState(() => queue?.length ?? 0);
  // Words answered here leave the list on the server; once this screen is
  // left, the count on the mistakes card and the next session read it again
  // instead of replaying this one.
  const answered = useRef(false);
  useEffect(
    () => () => {
      if (answered.current) void qc.invalidateQueries({ queryKey: ["mistakes"] });
    },
    [qc],
  );

  // The queue is taken once, in the order the server serves; answering a word
  // takes it out of this session whatever the answer.
  useEffect(() => {
    if (mistakes.data && !mistakes.isFetching && queue === null) {
      const ordered = orderQueue([...mistakes.data.mistakes]);
      setQueue(ordered);
      setStarted(ordered.length);
    }
  }, [mistakes.data, mistakes.isFetching, queue]);

  const done = queue !== null && queue.length === 0;
  useEffect(() => {
    if (done && started > 0 && burst === 0) {
      setBurst(1);
      sfx.play("lesson_complete");
    }
  }, [done, started, burst, sfx]);

  const answer = useMutation({
    mutationFn: (vars: { lexemeId: string; exerciseType: string; correct: boolean }) =>
      practiseMistake({
        lexemeId: vars.lexemeId,
        exerciseType: vars.exerciseType as never,
        correct: vars.correct,
        today: localToday(),
        tzOffsetMinutes: localTzOffset(),
      }),
    onSuccess: (r, vars) => {
      setSessionXp((x) => x + r.xp);
      qc.setQueryData(["progress"], r.progress);
      sfx.play(vars.correct ? "correct" : "wrong");
      void (vars.correct ? haptic.light() : haptic.warning());
    },
    onSettled: (_r, _e, vars) => {
      answered.current = true;
      // Offline or not, the word leaves this session; the server keeps the row.
      setQueue((q) => {
        if (!q) return q;
        const next = applyAnswer(q, vars.lexemeId, vars.correct);
        if (next.cleared) setCleared((n) => n + 1);
        return next.queue;
      });
      setRevealed(false);
    },
  });

  if (me.isPending || (me.data && (mistakes.isPending || (mistakes.data && queue === null))))
    return <RecallSkeleton answers={2} />;

  if (!me.data) {
    // A guest with a lesson behind them: the same wall as the second lesson.
    if (guest.walled)
      return (
        <Screen>
          <SaveProgressWall xp={guest.xp} lessons={guest.lessons} />
        </Screen>
      );
    return (
      <Screen>
        <Card tone="indigo">
          <Text className="font-display text-lg text-cloud">{t("mistakes.signInFirst")}</Text>
          <View className="mt-4 items-start">
            <Button label={t("nav.signIn")} variant="sun" onPress={() => router.push("/auth")} />
          </View>
        </Card>
      </Screen>
    );
  }
  if (mistakes.isError || !mistakes.data)
    return (
      <Screen>
        <Text className="font-body-semibold text-coral-deep">{t("common.error")}</Text>
      </Screen>
    );

  const current = queue?.[0];
  if (!current) {
    const practised = started > 0;
    return (
      <Screen>
        <Confetti burst={burst} count={24} />
        <Animated.View
          entering={m.reduced ? FadeIn : FlipInEasyX.duration(500)}
          className={`items-center rounded-4xl p-8 ${practised ? "bg-indigo" : "bg-cloud"}`}
        >
          <Penguin pose="cheer" size={130} />
          <Text
            className={`mt-2 text-center font-display text-2xl ${practised ? "text-cloud" : "text-indigo"}`}
            testID="mistakes-done"
          >
            {practised ? t("mistakes.sessionDone") : t("mistakes.none")}
          </Text>
          {practised && (
            <>
              <Text className="mt-1 font-body text-sm text-cloud/80">
                {t("mistakes.cleared")}: {cleared}
              </Text>
              <View className="my-4">
                <XpChip xp={sessionXp} size="xl" />
              </View>
            </>
          )}
          <View className={practised ? "" : "mt-5"}>
            <Button
              label={practised ? t("nav.learn") : t("mistakes.noneCta")}
              variant="sun"
              size="lg"
              onPress={() => router.navigate("/")}
            />
          </View>
        </Animated.View>
      </Screen>
    );
  }

  const actions: RecallAction[] = [
    {
      key: "wrong",
      label: t("mistakes.stillLearning"),
      variant: "coral",
      testID: "mistake-wrong",
    },
    { key: "right", label: t("mistakes.knewIt"), variant: "sea", testID: "mistake-right" },
  ];

  return (
    <Screen>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-body-semibold text-sm text-mist">
          {t("lesson.progress", { done: started - queue.length + 1, total: started })}
        </Text>
        <Text className="flex-1 text-center font-body-semibold text-sm text-mist" numberOfLines={1}>
          {t("mistakes.timesWrong", { count: current.timesWrong })}
        </Text>
        <XpChip xp={sessionXp} />
      </View>
      <RecallCard
        id={current.lexemeId}
        lexeme={current.lexeme}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        disabled={answer.isPending}
        actions={actions}
        onAnswer={(key) =>
          answer.mutate({
            lexemeId: current.lexemeId,
            exerciseType: current.exerciseType,
            correct: key === "right",
          })
        }
      />
    </Screen>
  );
}
